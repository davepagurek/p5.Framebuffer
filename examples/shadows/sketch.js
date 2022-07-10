let contactShadowRenderer

function setup() {
  createCanvas(400, 400, WEBGL)
  contactShadowRenderer = createContactShadowRenderer()
  contactShadowRenderer.setIntensity(0.4)
  contactShadowRenderer.setSearchRadius(150)
  contactShadowRenderer.setSamples(20)
}

function draw() {
  contactShadowRenderer.draw(() => {
    clear()
    push()
    background(255)
    noStroke()
    lights()

    push()
    fill('red')
    translate(50*sin(millis()/500), 50*cos(millis()/500), 100*sin(millis()/800 + 100))
    sphere(50, 40, 40)
    pop()

    push()
    fill('blue')
    translate(50*cos(millis()/300+12), 50*sin(millis()/600), 100*sin(millis()/800 + 1))
    sphere(50, 40, 40)
    pop()

    push()
    fill('white')
    translate(0, 100, -100)
    rotateX(PI/2)
    plane(900, 900)
    pop()
    pop()
  })
}
