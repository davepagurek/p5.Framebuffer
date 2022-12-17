class Renderer {
  constructor(target = window, options = {}) {
    this.target = target
    this.fbo = target.createFramebuffer(options)
    this.shader = target.createShader(this.vert(), this.frag())
  }

  vert() {
    throw new Error('Unimplemented')
  }

  frag() {
    throw new Error('Unimplemented')
  }

  getUniforms() {
    return {}
  }

  draw(cb) {
    this.fbo.draw(() => {
      this.target.push()
      cb()
      this.target.pop()
    })

    const uniforms = this.getUniforms()

    this.target.push()
    this.target.noStroke()
		this.target.rectMode(CENTER)
		this.target.shader(this.shader)
    for (const key in uniforms) {
      this.shader.setUniform(key, uniforms[key])
    }
    this.target.rect(0, 0, this.target.width, -this.target.height)
    this.target.pop()
  }

  remove() {
    this.fbo.remove()
  }
}

const superPerspective = p5.Camera.prototype.perspective
p5.Camera.prototype.perspective = function(fovy, aspect, near, far) {
	this._near = near === undefined ? this.defaultCameraNear : near
	this._far = far === undefined ? this.defaultCameraFar : far
	superPerspective.call(this, fovy, aspect, near, far)
}
