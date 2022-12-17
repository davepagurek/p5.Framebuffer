class ContactShadowRenderer extends Renderer {
  constructor(target, options) {
    super(target, options)
    if (!this.target._renderer.hasWebGL2) {
      this.target._renderer.GL.getExtension('OES_standard_derivatives')
    }
    this.intensity = 0.5
    this.numSamples = 15
    this.exponent = 250
    this.bias = 1.
    this.searchRadius = 100
  }

  prefix() {
    if (this.target._renderer.hasWebGL2) {
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

  setIntensity(intensity) {
    this.intensity = intensity
  }
  setSamples(numSamples) {
    this.numSamples = numSamples
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

  getUniforms() {
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
      uNumSamples: this.numSamples,
      uNear: this.target._renderer._curCamera.cameraNear,
      uFar: this.target._renderer._curCamera.cameraFar,
      uProjInfo: projInfo,
      uExponent: this.exponent,
      uBias: this.bias,
      uSearchRadius: this.searchRadius,
    }
  }
}

p5.prototype.createContactShadowRenderer = function() {
  return new ContactShadowRenderer(this)
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

const int MAX_NUM_SAMPLES = 50;

float rand(vec2 co){
  return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
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
    float phi = t * 11. * ${2 * Math.PI} + 0.5*rand(gl_FragCoord.xy);
    float theta = t * ${Math.PI / 2} + 0.5*rand(gl_FragCoord.xy);
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
#ifdef IS_WEBGL2
  outColor = vec4(color.rgb * mix(1., occlusion, uIntensity), color.a);
#else
  gl_FragColor = vec4(color.rgb * mix(1., occlusion, uIntensity), color.a);
#endif
}
`
