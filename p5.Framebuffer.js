const _createFramebuffer = function() {
  const fb = new Framebuffer(this)

  // Extend the old resize handler to also update the size of the framebuffer
  const oldResize = this._renderer.resize
  this._renderer.resize = (w, h) => {
    oldResize.call(this._renderer, w, h)
    fb.handleResize()
  }

  return fb
}
p5.prototype.createFramebuffer = _createFramebuffer
p5.Graphics.prototype.createFramebuffer = _createFramebuffer

const parentGetTexture = p5.RendererGL.prototype.getTexture
p5.RendererGL.prototype.getTexture = function(imgOrTexture) {
  if (imgOrTexture instanceof p5.Texture) {
    return imgOrTexture
  } else {
    return parentGetTexture.call(this, imgOrTexture)
  }
}

// P5 manages its own WebGL textures normally, so that users don't
// have to worry about manually updating texture data on the GPU.
//
// However, if we're trying to use a framebuffer texture that we've
// drawn to via WebGL, we don't want to ever send data to it, since
// it gets content when we draw to it! So we need to make something
// that looks like a p5 texture but that never tries to update
// data in order to use framebuffer textures inside p5.
class RawTextureWrapper extends p5.Texture {
  constructor(
    renderer,
    obj,
    w,
    h,
  ) {
    super(renderer, obj)
    this.width = w
    this.height = h
    return this
  }

  _getTextureDataFromSource() {
    return this.src
  }

  init(tex) {
    const gl = this._renderer.GL
    this.glTex = tex

    this.glWrapS = this._renderer.textureWrapX
    this.glWrapT = this._renderer.textureWrapY

    this.setWrapMode(this.glWrapS, this.glWrapT)
    this.setInterpolation(this.glMinFilter, this.glMagFilter)
  }

  update() {
    return false
  }
}

class Framebuffer {
  constructor(canvas) {
    this._renderer = canvas._renderer

    const gl = this._renderer.GL
    const ext = gl.getExtension('WEBGL_depth_texture')
    if (!ext) {
      throw new Error('Unable to create depth textures in this environment')
    }

    const framebuffer = gl.createFramebuffer()
    if (!framebuffer) {
      throw new Error('Unable to create a framebuffer')
    }
    this.framebuffer = framebuffer
    this.recreateTextures()
  }

  handleResize() {
    const oldColor = this.colorTexture
    const oldDepth = this.depthTexture

    this.recreateTextures()

    this.deleteTexture(oldColor)
    this.deleteTexture(oldDepth)
  }

  recreateTextures() {
    const gl = this._renderer.GL

    const width = this._renderer.width
    const height = this._renderer.height
    const density = this._renderer._pInst._pixelDensity
    const hasAlpha = this._renderer._pInst._glAttributes.alpha

    const colorTexture = gl.createTexture()
    if (!colorTexture) {
      throw new Error('Unable to create color texture')
    }
    gl.bindTexture(gl.TEXTURE_2D, colorTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      hasAlpha ? gl.RGBA : gl.RGB,
      width * density,
      height * density,
      0,
      hasAlpha ? gl.RGBA : gl.RGB,
      gl.UNSIGNED_BYTE,
      null,
    )

    // Create the depth texture
    const depthTexture = gl.createTexture()
    if (!depthTexture) {
      throw new Error('Unable to create depth texture')
    }
    gl.bindTexture(gl.TEXTURE_2D, depthTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.DEPTH_COMPONENT,
      width * density,
      height * density,
      0,
      gl.DEPTH_COMPONENT,
      gl.UNSIGNED_SHORT,
      null,
    )

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      colorTexture,
      0,
    )
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      depthTexture,
      0,
    )

    const depthP5Texture = new RawTextureWrapper(
      this._renderer,
      depthTexture,
      width * density,
      height * density,
    )
    this._renderer.textures.push(depthP5Texture)

    const colorP5Texture = new RawTextureWrapper(
      this._renderer,
      colorTexture,
      width * density,
      height * density,
    )
    this._renderer.textures.push(colorP5Texture)

    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    this.depthTexture = depthTexture
    this.depth = depthP5Texture
    this.colorTexture = colorTexture
    this.color = colorP5Texture
  }

  deleteTexture(texture) {
    const gl = this._renderer.GL
    gl.deleteTexture(texture)

    const p5TextureIdx = this._renderer.textures.findIndex(
      (t) => t.src === texture,
    )
    if (p5TextureIdx !== -1) {
      this._renderer.textures.splice(p5TextureIdx, 1)
    }
  }

  draw(cb) {
    this._renderer.GL.bindFramebuffer(
      this._renderer.GL.FRAMEBUFFER,
      this.framebuffer,
    )
    cb()
    this._renderer.GL.bindFramebuffer(this._renderer.GL.FRAMEBUFFER, null)
  }
}
