const _createFramebuffer = function(options) {
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
    if (!Framebuffer.forceWebGL1) {
      this.drawingContext =
        this.canvas.getContext('webgl2', this._pInst._glAttributes)
    }
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

class FramebufferCamera extends p5.Camera {
  constructor(fbo) {
    super(fbo._renderer)
    this.fbo = fbo
  }

  _computeCameraDefaultSettings() {
    super._computeCameraDefaultSettings()
    this.defaultAspectRatio = this.fbo.width / this.fbo.height
    this.defaultEyeZ =
      this.fbo.height / 2.0 / Math.tan(this.defaultCameraFOV / 2.0)
    this.defaultCameraNear = this.defaultEyeZ * 0.1
    this.defaultCameraFar = this.defaultEyeZ * 10
  }

  resize() {
    // If we're using the default camera, update the aspect ratio
    if (this.cameraType === 'default') {
      this._computeCameraDefaultSettings()
      this._setDefaultCamera()
    } else {
      this.perspective(
        this.cameraFOV,
        this.fbo.width / this.fbo.height
      );
    }
  }
}

class Framebuffer {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this._renderer = canvas._renderer
    const gl = this._renderer.GL
    if (!this._renderer.hasWebGL2 && !gl.getExtension('WEBGL_depth_texture')) {
      throw new Error('Unable to create depth textures in this environment')
    }

    const size = options.size
    this.autoSized = !size
    if (size) {
      this.width = size.width || 400
      this.height = size.height || 400
      this.density = size.pixelDensity || canvas.pixelDensity()
    }

    this.antialias = options.antialias || false

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
    if (this.antialias && this._renderer.hasWebGL2) {
      this.aaFramebuffer = gl.createFramebuffer()
      if (!this.aaFramebuffer) {
        throw new Error('Unable to create a framebuffer')
      }
    }

    this.recreateTextures()

    const prevCamera = this._renderer._curCamera
    this.cam = this.createCamera()
    canvas.setCamera(prevCamera)
  }

  createCamera() {
    const cam = new FramebufferCamera(this)
    cam._computeCameraDefaultSettings();
    cam._setDefaultCamera();
    this._renderer._curCamera = cam;
    return cam;
  }

  defaultCamera() {
    return this.cam
  }

  resizeCanvas(width, height) {
    this.autoSized = false
    this.width = width
    this.height = height
    this.handleResize()
  }
  pixelDensity(density) {
    if (density) {
      this.autoSized = false
      this.density = density
      this.handleResize()
    } else {
      return this.density * this.aaDensity
    }
  }
  autoSized(autoSized) {
    if (autoSized === undefined) {
      return this.autoSized
    } else {
      this.autoSized = autoSized
      this.handleResize()
    }
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
    if (this.antialias && this._renderer.hasWebGL2) {
      return this.glInternalRenderbufferFormat(hasAlpha)
    }
    const gl = this._renderer.GL
    if (this._renderer.hasWebGL2 && this.colorFormat === gl.FLOAT) {
      return hasAlpha ? gl.RGBA16F : gl.RGB16F
    } else {
      return hasAlpha ? gl.RGBA : gl.RGB
    }
  }
  glInternalRenderbufferFormat(hasAlpha) {
    const gl = this._renderer.GL
    if (this.colorFormat === gl.FLOAT) {
      if (this._renderer.hasWebGL2) {
        return gl.RGBA16F
      } else {
        throw new Error('Antialiased floating point values are not available in WebGL 1 mode')
      }
    } else {
      return hasAlpha ? gl.RGBA4 : gl.RGB565
    }
  }
  glDepthInternalFormat() {
    const gl = this._renderer.GL
    return this._renderer.hasWebGL2 ? gl.DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT
  }
  glDepthInternalRenderbufferFormat() {
    const gl = this._renderer.GL
    return this._renderer.hasWebGL2 ? gl.DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT16
  }
  glFormat(hasAlpha) {
    const gl = this._renderer.GL
    return hasAlpha ? gl.RGBA : gl.RGB
  }

  handleResize() {
    this.cam.resize()

    const oldColor = this.colorTexture
    const oldDepth = this.depthTexture
    const oldColorRenderbuffer = this.colorRenderbuffer
    const oldDepthRenderbuffer = this.depthRenderbuffer

    this.recreateTextures()

    this.deleteTexture(oldColor)
    this.deleteTexture(oldDepth)
    const gl = this._renderer.GL
    if (oldColorRenderbuffer) gl.deleteRenderbuffer(oldColorRenderbuffer)
    if (oldDepthRenderbuffer) gl.deleteRenderbuffer(oldDepthRenderbuffer)
  }
  updateSize() {
    if (this.autoSized) {
      this.width = this._renderer.width
      this.height = this._renderer.height
      this.density = this._renderer._pInst._pixelDensity
    }
    this.aaDensity = this.antialias && !this._renderer.hasWebGL2 ? 2 : 1
  }

  recreateTextures() {
    const gl = this._renderer.GL

    this.updateSize()
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
      this.width * this.density * this.aaDensity,
      this.height * this.density * this.aaDensity,
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
      this.glDepthInternalFormat(),
      this.width * this.density * this.aaDensity,
      this.height * this.density * this.aaDensity,
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

    // Create separate framebuffer for antialiasing
    if (this.antialias && this._renderer.hasWebGL2) {
      this.colorRenderbuffer = gl.createRenderbuffer()
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.colorRenderbuffer)
      if (this._renderer.hasWebGL2) {
        gl.renderbufferStorageMultisample(
          gl.RENDERBUFFER,
          4,
          this.glInternalRenderbufferFormat(hasAlpha),
          this.width * this.density,
          this.height * this.density,
        )
      } else {
        // TODO: use this in WebGL 1
        gl.renderbufferStorage(
          gl.RENDERBUFFER,
          Math.min(4, gl.getParameter(gl.MAX_SAMPLES)),
          this.glInternalRenderbufferFormat(hasAlpha),
          this.width * this.density,
          this.height * this.density,
        )
      }

      this.depthRenderbuffer = gl.createRenderbuffer()
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderbuffer)
      if (this._renderer.hasWebGL2) {
        gl.renderbufferStorageMultisample(
          gl.RENDERBUFFER,
          Math.min(4, gl.getParameter(gl.MAX_SAMPLES)),
          this.glDepthInternalRenderbufferFormat(),
          this.width * this.density,
          this.height * this.density,
        )
      } else {
        // TODO: use this in WebGL 1
        gl.renderbufferStorage(
          gl.RENDERBUFFER,
          gl.getParameter(gl.MAX_SAMPLES),
          this.glDepthInternalRenderbufferFormat(),
          this.width * this.density,
          this.height * this.density,
        )
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.aaFramebuffer)
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.RENDERBUFFER,
        this.colorRenderbuffer,
      )
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.RENDERBUFFER,
        this.depthRenderbuffer,
      )
    }

    const depthP5Texture = new RawTextureWrapper(
      this._renderer,
      depthTexture,
      {
        minFilter: 'nearest',
        magFilter: 'nearest',
      },
      this.width * this.density * this.aaDensity,
      this.height * this.density * this.aaDensity,
    )
    this._renderer.textures.push(depthP5Texture)

    const colorP5Texture = new RawTextureWrapper(
      this._renderer,
      colorTexture,
      {
        glMinFilter: 'nearest',
        glMagFilter: 'nearest',
      },
      this.width * this.density * this.aaDensity,
      this.height * this.density * this.aaDensity,
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
    if (this.antialias && this._renderer.hasWebGL2) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.aaFramebuffer)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    }
    const prevViewport = gl.getParameter(gl.VIEWPORT)
    gl.viewport(
      0,
      0,
      this.width * this.density * this.aaDensity,
      this.height * this.density * this.aaDensity,
    )
    this.canvas.push()
    this.canvas.setCamera(this.cam)
    this._renderer.uMVMatrix.set(
      this._renderer._curCamera.cameraMatrix.mat4[0],
      this._renderer._curCamera.cameraMatrix.mat4[1],
      this._renderer._curCamera.cameraMatrix.mat4[2],
      this._renderer._curCamera.cameraMatrix.mat4[3],
      this._renderer._curCamera.cameraMatrix.mat4[4],
      this._renderer._curCamera.cameraMatrix.mat4[5],
      this._renderer._curCamera.cameraMatrix.mat4[6],
      this._renderer._curCamera.cameraMatrix.mat4[7],
      this._renderer._curCamera.cameraMatrix.mat4[8],
      this._renderer._curCamera.cameraMatrix.mat4[9],
      this._renderer._curCamera.cameraMatrix.mat4[10],
      this._renderer._curCamera.cameraMatrix.mat4[11],
      this._renderer._curCamera.cameraMatrix.mat4[12],
      this._renderer._curCamera.cameraMatrix.mat4[13],
      this._renderer._curCamera.cameraMatrix.mat4[14],
      this._renderer._curCamera.cameraMatrix.mat4[15]
    )
    cb()
    if (this.antialias && this._renderer.hasWebGL2) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.aaFramebuffer)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.framebuffer)
      for (const [flag, filter] of [[gl.COLOR_BUFFER_BIT, gl.LINEAR], [gl.DEPTH_BUFFER_BIT, gl.NEAREST]]) {
        gl.blitFramebuffer(
          0, 0,
          this.width * this.density * this.aaDensity, this.height * this.density * this.aaDensity,
          0, 0,
          this.width * this.density * this.aaDensity, this.height * this.density * this.aaDensity,
          flag,
          filter,
        )
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer)
    gl.viewport(...prevViewport)
    this.canvas.pop()
  }

  remove() {
    const gl = this._renderer.GL
    this.deleteTexture(this.colorTexture)
    this.deleteTexture(this.depthTexture)
    gl.deleteFramebuffer(this.framebuffer)
    if (this.aaFramebuffer) {
      gl.deleteFramebuffer(this.aaFramebuffer)
    }
    if (this.depthRenderbuffer) {
      gl.deleteRenderbuffer(this.depthRenderbuffer)
    }
    if (this.colorRenderbuffer) {
      gl.deleteRenderbuffer(this.colorRenderbuffer)
    }
  }
}

Framebuffer.forceWebGL1 = false
