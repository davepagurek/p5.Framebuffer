let fbo
let blurShader

function preload() {
  blurShader = loadShader('blur.vert', 'blur.frag')
}

function setup() {
  createCanvas(400, 400, WEBGL);
  fbo = createFramebuffer()
}

function draw() {
  const eyeZ = (height/2) / tan(PI/6)
  const near = eyeZ/10
  const far = eyeZ*10
  perspective(PI/3, width/height, near, far)

  const blurIntensity = 0.006
  // Since the camera is set back `eyeZ`, to focus on objects at z=0, we need
  // to focus eyeZ in front of the camera.
  const targetDepth = eyeZ

  fbo.draw(() => {
    clear()
    push()
    background(255)
    noStroke()
    lights()

    push()
    fill('red')
    translate(50*sin(millis()/500), 50*cos(millis()/500), 100*sin(millis()/800 + 100))
    sphere(50)
    pop()

    push()
    fill('blue')
    translate(50*cos(millis()/300+12), 50*sin(millis()/600), 100*sin(millis()/800 + 1))
    sphere(50)
    pop()

    push()
    fill('white')
    translate(0, 1000, -100)
    sphere(900)
    pop()
    pop()
  })
  
  clear()

  push()
  noStroke()
  rectMode(CENTER)
  shader(blurShader)
  blurShader.setUniform('uImg', fbo.color)
  blurShader.setUniform('uDepth', fbo.depth)
  blurShader.setUniform('uSize', [width, height])
  blurShader.setUniform('uIntensity', 0.05)
  blurShader.setUniform('uNumSamples', 15)
  blurShader.setUniform('uTargetZ', targetDepth)
  blurShader.setUniform('uNear', near)
  blurShader.setUniform('uFar', far)
  plane(width, -height)
  pop()
}
