class ContactShadowRenderer extends Renderer {
  constructor(target, options) {
    super(target, options)
    if (!this.target.webglVersion === WEBGL2) {
      this.target._renderer.GL.getExtension('OES_standard_derivatives')
    }
    this.fbo2 = target.createFramebuffer(options)
    this.blurShader = target.createShader(this.blurVert(), this.blurFrag())
    this.intensity = 0.5
    this.numShadowSamples = 15
    this.numBlurSamples = 20
    this.exponent = 250
    this.bias = 0.1
    this.searchRadius = 100
    this.blurRadius = 50
  }

  prefix() {
    if (this.target.webglVersion === WEBGL2) {
      return '#version 300 es\n#define IS_WEBGL2\n'
    } else {
      return '#extension GL_OES_standard_derivatives : enable\n'
    }
  }

  vert() {
    return this.prefix() + ContactShadowRenderer.vert
  }

  frag() {
    return this.prefix() + ContactShadowRenderer.frag
  }

  blurVert() {
    return this.vert()
  }

  blurFrag() {
    return this.prefix() + ContactShadowRenderer.blurFrag
  }

  setIntensity(intensity) {
    this.intensity = intensity
  }
  setShadowSamples(numSamples) {
    this.numShadowSamples = numSamples
  }
  setBlurSamples(numSamples) {
    this.numBlurSamples = numSamples
  }
  setBlurRadius(r) {
    this.blurRadius = r
  }
  setExponent(exponent) {
    this.exponent = exponent
  }
  setBias(bias) {
    this.bias = bias
  }
  setSearchRadius(radius) {
    this.searchRadius = radius
  }

  getShadowUniforms() {
    const projInfo = [
      -2 / (this.target.width * this.target._renderer.uPMatrix.mat4[0]),
      -2 / (this.target.height * this.target._renderer.uPMatrix.mat4[5]),
      (1 - this.target._renderer.uPMatrix.mat4[2]) / this.target._renderer.uPMatrix.mat4[0],
      (1 + this.target._renderer.uPMatrix.mat4[6]) / this.target._renderer.uPMatrix.mat4[5]
    ]

    return {
      uImg: this.fbo.color,
      uDepth: this.fbo.depth,
      uSize: [this.target.width, this.target.height],
      uIntensity: this.intensity,
      uNumSamples: this.numShadowSamples,
      uNear: this.target._renderer._curCamera.cameraNear,
      uFar: this.target._renderer._curCamera.cameraFar,
      uProjInfo: projInfo,
      uExponent: this.exponent,
      uBias: this.bias,
      uSearchRadius: this.searchRadius,
    }
  }

  getBlurUniforms() {
    return {
      uImg: this.fbo.color,
      uDepth: this.fbo.depth,
      uShadow: this.fbo2.color,
      uSize: [this.target.width, this.target.height],
      uIntensity: this.intensity,
      uNear: this.target._renderer._curCamera.cameraNear,
      uFar: this.target._renderer._curCamera.cameraFar,
      uNumSamples: this.numBlurSamples,
      uBlurRadius: this.blurRadius,
    }
  }

  draw(cb) {
    const shadowUniforms = this.getShadowUniforms()
    const blurUniforms = this.getBlurUniforms()

    this.fbo.draw(() => {
      this.target.push()
      cb()
      this.target.pop()
    })

    this.target.push()
    
    this.fbo2.draw(() => {
      this.target.push()
      this.target.clear()
      this.target.noStroke()
      this.target.rectMode(CENTER)
      this.target.shader(this.shader)
      for (const key in shadowUniforms) {
        this.shader.setUniform(key, shadowUniforms[key])
      }
      this.target.rect(0, 0, this.target.width, -this.target.height)
      this.target.pop()
    })

    this.target.noStroke()
    this.target.rectMode(CENTER)
    this.target.shader(this.blurShader)
    for (const key in blurUniforms) {
      this.blurShader.setUniform(key, blurUniforms[key])
    }
    this.target.rect(0, 0, this.target.width, -this.target.height)
    this.target.pop()
  }
}

p5.prototype.createContactShadowRenderer = function(options) {
  return new ContactShadowRenderer(this, options)
}

ContactShadowRenderer.vert = `
#ifdef IS_WEBGL2
in vec3 aPosition;
in vec3 aNormal;
in vec2 aTexCoord;
#else
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;
#endif

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;

#ifdef IS_WEBGL2
out highp vec2 vVertTexCoord;
#else
varying highp vec2 vVertTexCoord;
#endif

void main(void) {
  vec4 positionVec4 = vec4(aPosition, 1.0);
  gl_Position = uProjectionMatrix * uModelViewMatrix * positionVec4;
  vVertTexCoord = aTexCoord;
}
`

ContactShadowRenderer.frag = `
precision highp float;
#ifdef IS_WEBGL2
in highp vec2 vVertTexCoord;
out highp vec4 outColor;
#else
varying highp vec2 vVertTexCoord;
#endif

uniform sampler2D uImg;
uniform sampler2D uDepth;
uniform vec2 uSize;
uniform int uNumSamples;
uniform float uNear;
uniform float uFar;
uniform vec4 uProjInfo;
uniform float uSearchRadius;
uniform float uIntensity;
uniform float uExponent;
uniform float uBias;

const int MAX_NUM_SAMPLES = 100;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
}
float rand(vec4 co) {
  return fract(rand(co.xz) + rand(co.xy) + rand(co.yw) + rand(co.zw));
}

vec3 worldFromScreen(vec2 offset) {
#ifdef IS_WEBGL2
  float z = uNear * uFar  / ((uNear - uFar) * texture(uDepth, vVertTexCoord + offset).x + uFar);
#else
  float z = uNear * uFar  / ((uNear - uFar) * texture2D(uDepth, vVertTexCoord + offset).x + uFar);
#endif
  return vec3((((vVertTexCoord + offset) * uSize) * uProjInfo.xy + uProjInfo.zw) * z, z);
}

vec2 screenFromWorld(vec3 world) {
  return (world.xy/world.z - uProjInfo.zw)/uProjInfo.xy;
}

const float EPSILON = 0.01;

mat4 axisAngleRotation(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;

  return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
              oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
              oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
              0.0,                                0.0,                                0.0,                                1.0);
}
vec3 adjustNormal(
  vec3 origNormal,
  vec3 displacementNormal,
  vec3 noDisplacementNormal
) {
  // Find the rotation induced by the displacement
  float angle = acos(dot(displacementNormal, noDisplacementNormal));
  vec3 rawAxis = cross(displacementNormal, noDisplacementNormal);
  if (length(rawAxis) < 0.01) {
    return origNormal;
  }
  vec3 axis = normalize(rawAxis);
  mat4 rotation = axisAngleRotation(axis, angle);

  // Apply the rotation to the original normal
  vec3 normal = (rotation * vec4(origNormal, 0.)).xyz;
  return normal;
}

void main() {
#ifdef IS_WEBGL2
  vec4 color = texture(uImg, vVertTexCoord);
#else
  vec4 color = texture2D(uImg, vVertTexCoord);
#endif
  vec3 position = worldFromScreen(vec2(0., 0.));
  vec3 normal = normalize(cross(dFdx(position), dFdy(position)));

  float radiusSquared = uSearchRadius * uSearchRadius;

  float occlusion = 0.;

  for (int i = 0; i < MAX_NUM_SAMPLES; i++) {
    if (i >= uNumSamples) break;
    float t = (float(i + 1) / float(uNumSamples));

    // Sample a sort of random ish coordinate in a half sphere pointing up
    float phi = ${2 * Math.PI} * rand(vec4(gl_FragCoord.xy,t*100.,0.));
    float theta = ${Math.PI / 2} * rand(vec4(gl_FragCoord.xy,t*100.,100.));
    float radius = 1.0 - t*t;
    vec3 localOff = vec3(
      radius * cos(phi) * sin(theta),
      radius * cos(theta),
      radius * sin(phi) * sin(theta)
    );

    // Translate that to be a hemisphere oriented with the surface normal
    vec3 rotatedOff = adjustNormal(localOff, normal, vec3(0., 1., 0.));
    vec3 testPosition = position + rotatedOff * uSearchRadius;
    vec2 screenPosition = screenFromWorld(testPosition);
    vec2 offset = screenPosition / uSize - vVertTexCoord;
    
    // At that screen space coordinate, what is the position of the object we see?
    vec3 samplePos = worldFromScreen(offset);

    if (samplePos.z > mix(uNear, uFar, 0.99)) continue;

    // The amount of occlusion is proportional to the *cosine* of the angle between
    // the line connecting the object to the surface and the surface normal. This is
    // because light coming in at an angle is more spread out and thus delivers less
    // energy to the surface.
    //
    // The dot product of originToSample and the normal is proportional to this energy
    // because dot(a, b) is equivalent to length(a)*length(b)*cos(angle_between_a_and_b)
    vec3 originToSample = samplePos - position;
    float squaredDistanceToSample = dot(originToSample, originToSample);
    float vn = dot(originToSample, normal) - uBias;

    // We only let stuff start making a shadow when it's within our search radius. At
    // the edge it should not occlude, and as it gets closer, it should occlude more.
    // We'll give it a cubic falloff so it looks smoother.
    float f = max(radiusSquared - squaredDistanceToSample, 0.0) / radiusSquared;
    float sampleOcclusion = f * f * f * max(vn / (EPSILON + squaredDistanceToSample), 0.0);

    occlusion += sampleOcclusion;
  }
  occlusion = 1.0 - (occlusion / float(uNumSamples));
  occlusion = clamp(pow(occlusion, 1.0 + uExponent), 0.0, 1.0);
  vec4 finalColor = vec4(occlusion, occlusion, occlusion, 1.);
#ifdef IS_WEBGL2
  outColor = finalColor;
#else
  gl_FragColor = finalColor;
#endif
}
`

ContactShadowRenderer.blurFrag = `
precision highp float;
#ifdef IS_WEBGL2
in highp vec2 vVertTexCoord;
out highp vec4 outColor;
#else
varying highp vec2 vVertTexCoord;
#endif

uniform sampler2D uImg;
uniform sampler2D uDepth;
uniform sampler2D uShadow;
uniform vec2 uSize;
uniform float uNear;
uniform float uFar;
uniform float uIntensity;
uniform int uNumSamples;
uniform float uBlurRadius;

#ifdef IS_WEBGL2
#define texFn texture
#else
#define texFn texture2D
#endif

float depthToZ(float depth) {
  float depthNormalized = 2.0 * depth - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - depthNormalized * (uFar - uNear));
}

const int MAX_NUM_SAMPLES = 100;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
}
float rand(vec4 co) {
  return fract(rand(co.xz) + rand(co.xy) + rand(co.yw) + rand(co.zw));
}

void main() {
  vec4 color = texFn(uImg, vVertTexCoord);

  float origZ = depthToZ(texFn(uDepth, vVertTexCoord).x);
  float occlusion = texFn(uShadow, vVertTexCoord).x;
  float total = 1.;

  for (int i = 0; i < MAX_NUM_SAMPLES; i++) {
    if (i >= uNumSamples) break;
    float t = (float(i) / float(uNumSamples - 1));
    float angle = (t*12.0) * ${2 * Math.PI};
    float radius = 1.0 - t;
    angle += 5.*rand(gl_FragCoord.xy);

    vec2 offset = (vec2(cos(angle),sin(angle)) * radius * uBlurRadius)/uSize;
    float z = depthToZ(texFn(uDepth, vVertTexCoord + offset).x);

    float weight = float(z >= origZ);
    float shadowSample = texFn(uShadow, vVertTexCoord + offset).x;
    occlusion += weight * shadowSample;
    total += weight;
  }
  occlusion /= total;
  vec4 mixedColor = vec4(color.rgb * mix(1., occlusion, uIntensity), color.a);
#ifdef IS_WEBGL2
  outColor = mixedColor;
#else
  gl_FragColor = mixedColor;
#endif
}
`
