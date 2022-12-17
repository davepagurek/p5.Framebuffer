let fboPrev, fboNext
let canvas

function setup() {
  canvas = createCanvas(400, 400, WEBGL)
  // There's a bug in Firefox where you can only make floating point textures
  // if they're RGBA, and it breaks if it's just RGB
  setAttributes({ alpha: true })

  // Try changing `float` to `unsigned_byte` to see it leave a trail
  options = { colorFormat: 'float', antialias: true }
  fboPrev = createFramebuffer(options)
  fboNext = createFramebuffer(options)
  imageMode(CENTER)
  rectMode(CENTER)
  noStroke()
}

function draw() {
  // Swap prev and next so that we can use the previous frame as a texture
  // when drawing the current frame
  [fboPrev, fboNext] = [fboNext, fboPrev]

  // Draw to the Framebuffer
  fboNext.draw(() => {
    clear()

    background(255)

    // Disable depth testing so that the image of the previous
    // frame doesn't cut off the sube
    _renderer.GL.disable(_renderer.GL.DEPTH_TEST)
    push()
    scale(1.003)
    texture(fboPrev.color)
    plane(width, -height)
    pop()

    push()
    // Fade to white slowly. This will leave a permanent trail if you don't
    // use floating point textures.
    fill(255, 1)
    rect(0, 0, width, height)
    pop()
    _renderer.GL.enable(_renderer.GL.DEPTH_TEST)

    push()
    normalMaterial()
    translate(100*sin(frameCount * 0.014), 100*sin(frameCount * 0.02), 0)
    rotateX(frameCount * 0.01)
    rotateY(frameCount * 0.01)
    box(50)
    pop()
  })

  clear()
  push()
  texture(fboNext.color)
  plane(width, -height)
  pop()
}
