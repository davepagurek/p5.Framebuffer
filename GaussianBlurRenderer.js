class GaussianBlurRenderer extends BlurRenderer {
  constructor(target) {
    super(target)
    this.fbo2 = target.createFramebuffer()
    this.intensity = 0.1
    this.numSamples = 20
  }

  frag() {
    return GaussianBlurRenderer.frag
  }

  getUniforms() {
    const uniforms = super.getUniforms()
    delete uniforms.uImg
    return uniforms
  }
  
  draw(cb) {
    const prevCamera = this.target._renderer._curCamera
    this.fbo.draw(() => {
      this.target.push()
      cb()
      this.target.pop()
    })

    const uniforms = this.getUniforms()

    this.target.push()
    this.target.setCamera(this.cam)
    this.cam.move(0, 0, 0)
    
    this.fbo2.draw(() => {
      this.target.push()
      this.target.clear()
      this.target.noStroke()
      this.target.rectMode(CENTER)
      this.target.shader(this.shader)
      for (const key in uniforms) {
        this.shader.setUniform(key, uniforms[key])
        this.shader.setUniform('uDirection', 0)
        this.shader.setUniform('uImg', this.fbo.color)
      }
      this.target.rect(0, 0, this.target.width, -this.target.height)
      this.target.pop()
    })

    this.target.noStroke()
    this.target.rectMode(CENTER)
    this.target.shader(this.shader)
    for (const key in uniforms) {
      this.shader.setUniform(key, uniforms[key])
    }
    this.shader.setUniform('uDirection', 1)
    this.shader.setUniform('uImg', this.fbo2.color)
    this.target.rect(0, 0, this.target.width, -this.target.height)
    this.target.pop()
    this.target.setCamera(prevCamera)
  }

  remove() {
    super.remove()
    this.fbo2.remove()
  }
}

p5.prototype.createGaussianBlurRenderer = function() {
  return new GaussianBlurRenderer(this)
}

GaussianBlurRenderer.frag = `
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
uniform int uDirection;
#define s ${0.5/3}
const int MAX_NUM_SAMPLES = 50;
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
      float t = (float(i) / float(uNumSamples - 1));
      float radius = (t * 2. - 1.);
      float distAway = radius * uIntensity * blurAmt;
      vec2 offset = (uDirection == 0 ? vec2(1.,0.) : vec2(0.,1.)) * distAway / pixelScale;
      float z = depthToZ(texture2D(uDepth, vVertTexCoord + offset).x);
      float sampleBlur = calcBlur(z, pixelScale);
      float t2 = distAway / (sampleBlur * uIntensity);
      float weight = ${1/Math.sqrt(2*Math.PI)} / s * exp(-0.5*pow(t2/s,2.));
      vec4 sample = texture2D(uImg, vVertTexCoord + offset);
      color += weight * sample;
      total += weight;
    }
  }
  color /= total;
  gl_FragColor = color;
}
`
