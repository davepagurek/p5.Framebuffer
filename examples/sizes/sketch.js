let fboFixed
let fboAuto

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL)
  fboFixed = createFramebuffer({ size: { width: 300, height: 200 } })
  fboAuto = createFramebuffer()
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
}

function draw() {
  if (frameCount % 60 === 0) {
    // Flip aspect ratio every second
    fboFixed.resizeCanvas(fboFixed.height, fboFixed.width)
  }

  const spinningBox = () => {
    push()
    noStroke()
    fill(255, 0, 0)
    translate(0, 100*sin(frameCount * 0.01), 0)
    rotateX(frameCount * 0.01)
    rotateY(frameCount * 0.01)
    box(50)
    pop()
  }

  // Draw to the Framebuffer
  fboFixed.draw(() => {
    clear()
    background(255)
    spinningBox()
  })

  fboAuto.draw(() => {
    clear()
    background(225, 225, 255)
    spinningBox()
  })

  noStroke()

  push()
  texture(fboAuto.color)
  plane(fboAuto.width, -fboAuto.height)
  pop()

  push()
  translate(width / 4, height / 4)
  texture(fboFixed.color)
  plane(fboFixed.width, -fboFixed.height)
  pop()
}
