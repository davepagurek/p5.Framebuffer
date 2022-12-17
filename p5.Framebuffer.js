const _createFramebuffer = function (options) {
  const fb = new Framebuffer(this, options)

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

p5.RendererGL.prototype._initContext = function() {
  try {
    this.drawingContext =
      this.canvas.getContext('webgl2', this._pInst._glAttributes)
    this.hasWebGL2 = !!this.drawingContext
    if (!this.drawingContext) {
      this.drawingContext =
        this.canvas.getContext('webgl', this._pInst._glAttributes) ||
        this.canvas.getContext('experimental-webgl', this._pInst._glAttributes);
    }
    if (this.drawingContext === null) {
      throw new Error('Error creating webgl context');
    } else {
      const gl = this.drawingContext;
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      this._viewport = this.drawingContext.getParameter(
        this.drawingContext.VIEWPORT
      );
    }
  } catch (er) {
    throw er;
  }
};

const parentGetTexture = p5.RendererGL.prototype.getTexture
p5.RendererGL.prototype.getTexture = function (imgOrTexture) {
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
  constructor(renderer, obj, settings, w, h) {
    super(renderer, obj, settings)
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
  constructor(canvas, options = {}) {
    this._renderer = canvas._renderer
    const gl = this._renderer.GL
    if (!this._renderer.hasWebGL2 && !gl.getExtension('WEBGL_depth_texture')) {
      throw new Error('Unable to create depth textures in this environment')
    }

    this.colorFormat = this.glColorFormat(options.colorFormat)
    this.depthFormat = this.glDepthFormat(options.depthFormat)
    if (
      (options.colorFormat === 'float' || options.depthFormat === 'float') &&
      (
        this._renderer.hasWebGL2
          ? !gl.getExtension('EXT_color_buffer_float')
          : (!gl.getExtension('OES_texture_float') ||
             !gl.getExtension('OES_texture_float_linear') ||
             !gl.getExtension('WEBGL_color_buffer_float'))
      )
    ) {
      // Reset to default
      if (options.colorFormat === 'float') {
        this.colorFormat = this.glColorFormat()
      }
      if (options.depthFormat === 'float') {
        this.depthFormat = this.glDepthFormat()
      }
      console.warn(
        'Warning: Unable to create floating point textures in this environment. Falling back to integers',
      )
    }

    const framebuffer = gl.createFramebuffer()
    if (!framebuffer) {
      throw new Error('Unable to create a framebuffer')
    }
    this.framebuffer = framebuffer
    this.recreateTextures()
  }

  glColorFormat(format) {
    const gl = this._renderer.GL
    if (format === 'float') {
      return gl.FLOAT
    }
    return gl.UNSIGNED_BYTE
  }
  glDepthFormat(format) {
    const gl = this._renderer.GL
    if (format === 'float') {
      return gl.FLOAT
    }
    return gl.UNSIGNED_INT
  }
  glInternalFormat(hasAlpha) {
    const gl = this._renderer.GL
    if (this._renderer.hasWebGL2 && this.colorFormat === gl.FLOAT) {
      return hasAlpha ? gl.RGBA16F : gl.RGB16F
    } else {
      return hasAlpha ? gl.RGBA : gl.RGB
    }
  }
  glFormat(hasAlpha) {
    const gl = this._renderer.GL
    return hasAlpha ? gl.RGBA : gl.RGB
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

    const prevBoundTexture = gl.getParameter(gl.TEXTURE_BINDING_2D)
    const prevBoundFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING)

    const colorTexture = gl.createTexture()
    if (!colorTexture) {
      throw new Error('Unable to create color texture')
    }
    gl.bindTexture(gl.TEXTURE_2D, colorTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      this.glInternalFormat(hasAlpha),
      width * density,
      height * density,
      0,
      this.glFormat(hasAlpha),
      this.colorFormat,
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
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      this._renderer.hasWebGL2 ? gl.DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT,
      width * density,
      height * density,
      0,
      gl.DEPTH_COMPONENT,
      this.depthFormat,
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
      {
        minFilter: 'nearest',
        magFilter: 'nearest',
      },
      width * density,
      height * density,
    )
    this._renderer.textures.push(depthP5Texture)

    const colorP5Texture = new RawTextureWrapper(
      this._renderer,
      colorTexture,
      {
        glMinFilter: 'nearest',
        glMagFilter: 'nearest',
      },
      width * density,
      height * density,
    )
    this._renderer.textures.push(colorP5Texture)

    gl.bindTexture(gl.TEXTURE_2D, prevBoundTexture)
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevBoundFramebuffer)

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
    const gl = this._renderer.GL
    const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    cb()
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer)
  }

  remove() {
    const gl = this._renderer.GL
    this.deleteTexture(this.colorTexture)
    this.deleteTexture(this.depthTexture)
    gl.deleteFramebuffer(this.framebuffer)
  }
}
