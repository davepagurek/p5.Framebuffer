class BlurRenderer extends Renderer {
  constructor(target, options) {
    super(target, options)
    this.focus = (target.height / 2) / tan(PI / 6)
    this.intensity = 0.05
    this.dof = 0
    this.numSamples = 15
  }

  vert() {
    return BlurRenderer.vert
  }

  frag() {
    return BlurRenderer.frag
  }

  focusHere() {
    const matrix = new DOMMatrix(this.target._renderer.uMVMatrix.mat4)
    const center = new DOMPoint(0, 0, 0)
    const world = center.matrixTransform(matrix)
    this.focus = -world.z
  }

  setDof(dof) {
    this.dof = dof
  }

  setIntensity(intensity) {
    this.intensity = intensity
  }

  setSamples(numSamples) {
    this.numSamples = numSamples
  }

  getUniforms() {
    return {
      uImg: this.fbo.color,
      uDepth: this.fbo.depth,
      uSize: [this.target.width, this.target.height],
      uIntensity: this.intensity,
      uDof: this.dof,
      uNumSamples: this.numSamples,
      uNear: this.target._renderer._curCamera._near,
      uFar: this.target._renderer._curCamera._far,
      uTargetZ: this.focus,
    }
  }
}

p5.prototype.createBlurRenderer = function(options) {
  return new BlurRenderer(this, options)
}

BlurRenderer.vert = `
precision highp float;

attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;

varying highp vec2 vVertTexCoord;

void main(void) {
  vec4 positionVec4 = vec4(aPosition, 1.0);
  gl_Position = uProjectionMatrix * uModelViewMatrix * positionVec4;
  vVertTexCoord = aTexCoord;
}
`

BlurRenderer.frag = `
precision highp float;
varying highp vec2 vVertTexCoord;

uniform sampler2D uImg;
uniform sampler2D uDepth;
uniform vec2 uSize;
uniform float uIntensity;
uniform float uDof;
uniform float maxBlur;
uniform int uNumSamples;
uniform float uTargetZ;
uniform float uNear;
uniform float uFar;

#define PI 3.14159265359;

const int MAX_NUM_SAMPLES = 50;

float rand(vec2 co){
  return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
}

float depthToZ(float depth) {
  float depthNormalized = 2.0 * depth - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - depthNormalized * (uFar - uNear));
}

float calcBlur(float z, float pixelScale) {
  return clamp(abs(z - uTargetZ) - uDof / 2., 0.0, 0.3*pixelScale);
}

void main() {
  float total = 1.0;
  float origZ = depthToZ(texture2D(uDepth, vVertTexCoord).x);
  vec4 color = texture2D(uImg, vVertTexCoord);

  if (abs(origZ - uTargetZ) > uDof / 2.) {
    float pixelScale = max(uSize.x, uSize.y);
    float blurAmt = calcBlur(origZ, pixelScale);
    for (int i = 0; i < MAX_NUM_SAMPLES; i++) {
      if (i >= uNumSamples) break;
      float t = (float(i + 1) / float(uNumSamples));
      float angle = (t*12.0) * 2. * PI;
      float radius = 1.0 - (t*t*t); // Sample more on the outer edge
      angle += 5.*rand(gl_FragCoord.xy);
      vec2 offset = (vec2(cos(angle),sin(angle)) * radius * uIntensity * blurAmt)/pixelScale;
      float z = depthToZ(texture2D(uDepth, vVertTexCoord + offset).x);
      float sampleBlur = calcBlur(z, pixelScale);

      float weight = float((z >= origZ) || (sampleBlur >= blurAmt*radius + 5.));
      vec4 sample = texture2D(uImg, vVertTexCoord + offset);
      color += weight * sample;
      total += weight;
    }
  }

  color /= total;
  gl_FragColor = color;
}
`
