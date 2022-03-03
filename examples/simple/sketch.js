let fbo

function setup() {
  createCanvas(400, 400, WEBGL)
  fbo = createFramebuffer()
}

function draw() {
  // Draw a sphere to the Framebuffer
  fbo.draw(() => {
    clear()
    push()
    noStroke()
    fill(255, 0, 0)
    rotateX(frameCount * 0.01)
    rotateY(frameCount * 0.01)
    box(50)
    pop()
  })

  // Do something with fbo.color or dbo.depth
  clear()
  push()
  noStroke()
  
  push()
  translate(-width/4, -height/4)
  texture(fbo.depth)
  plane(width/2, -height/2)
  pop()
  
  push()
  translate(width/4, height/4)
  texture(fbo.color)
  plane(width/2, -height/2)
  pop()
  
  pop()
}