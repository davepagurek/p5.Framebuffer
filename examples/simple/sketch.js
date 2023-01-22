let fbo

function setup() {
  createCanvas(400, 400, WEBGL)
  fbo = createFramebuffer({ antialias: true })
}

function draw() {
  // Draw to the Framebuffer
  fbo.draw(() => {
    clear()
    background(255)
    push()
    noStroke()
    fill(255, 0, 0)
    translate(0, 100*sin(frameCount * 0.01), 0)
    rotateX(frameCount * 0.01)
    rotateY(frameCount * 0.01)
    box(50)
    pop()
  })

  // Do something with fbo.color or dbo.depth
  clear()
  background(255)
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
