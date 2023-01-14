# p5.Framebuffer

A library for efficiently drawing to a texture in p5 WebGL mode, with helpers for adding blur and shadows.

A Framebuffer is kind of like a `p5.Graphics`: it lets you draw to a canvas, and then treat that canvas like an image. A Framebuffer, on the other hand:
- is **faster**: it shares the same WebGL context as the rest of the sketch, so it doesn't need to copy extra data to the GPU each frame
- has **more information**: you can access the WebGL depth buffer as a texture, letting you do things like write focal blur shaders. This library comes with a blur helper and a contact shadow helper.
- is **WebGL only**: this will not work in 2D mode! `p5.Graphics` should be fine for that.

Read more about the motivation for this and how focal blur shaders work in <a href="https://www.davepagurek.com/blog/depth-of-field/">this blog post on the subject.</a>

![image](https://user-images.githubusercontent.com/5315059/172021218-b50f6693-40a6-49a1-99af-8dd9d73f00eb.png)
<small><em>Above: a screenshot from [a sketch](https://openprocessing.org/sketch/1590159) using p5.Framebuffer to blur out-of-focus areas</em></small>

## Get the library

Add the library to your source code, *after* loading p5 but *before* loading your own code. If you only want the core Framebuffer library without blur and shadow renderers, load `p5.Framebuffer.core.min.js` instead of just `.min.js`.

### Via CDN
```html
<script src="https://cdn.jsdelivr.net/npm/@davepagurek/p5.framebuffer@0.0.9/p5.Framebuffer.min.js"></script>
```

On OpenProcessing, paste this link into a new library slot:
```
https://cdn.jsdelivr.net/npm/@davepagurek/p5.framebuffer@0.0.9/p5.Framebuffer.min.js
```

### Self-hosted
[Download the minified or unminified source code from the releases tab](https://github.com/davepagurek/p5.Framebuffer/releases/), then add it to your HTML:
```html
<script type="text/javascript" src="p5.Framebuffer.min.js"></script>
```


## Usage

### Base Framebuffer, as a faster canvas

Create a Framebuffer in `setup` and use it in `draw`:

<table>
<tr>
<td>

```js
let fbo

function setup() {
  createCanvas(400, 400, WEBGL)
  fbo = createFramebuffer()
}

function draw() {
  // Draw a box to the Framebuffer
  fbo.draw(() => {
    clear()
    push()
    noStroke()
    fill(255, 0, 0)
    rotateX(frameCount * 0.01)
    rotateY(frameCount * 0.01)
    box(150)
    pop()
  })

  // Do something with fbo.color or dbo.depth
  texture(fbo.depth)
  noStroke()
  plane(width, height)
}
```

</td>
<td>
<img src="https://user-images.githubusercontent.com/5315059/178128913-a29bbfbf-a9c2-436d-9329-fbec2b5b2af9.png">
</td>
</tr>
</table>

Methods:
- `p5.prototype.createFramebuffer(options?: Options)`
  - `options.colorFormat: 'float' | 'unsigned_byte'`
    - Specify whether to use floating point storage for the color texture
    - Defaults to `'unsigned_byte'`
    - Note: If you use floating point colors, in Firefox you must also call `setAttributes({ alpha: true })`
  - `options.size: { width: number; height: number; pixelDensity: number | undefined }`
    - Optionally specify a size and pixel density separate from the main canvas or graphic
    - If unspecified, the Framebuffer will resize when its canvas does
  - `options.antialias: boolean`
    - Turn on antialiasing by passing `true`
    - WebGL2 (the default, if available) will use multisampled antialiasing
    - WebGL1 will render at 2x the pixel density of the canvas for pseudo-antialiasing

Notes:
- `draw()` uses the same p5 context as the rest of your sketch! Make sure to wrap your callback code in a `push()` and `pop()` to ensure your settings don't leak out into your non-Framebuffer code.
- When you `resizeCanvas`, the Framebuffer will automatically resize accordingly. You probably will want to clear it and redraw to it if you had a texture cached.

A live example: https://davepagurek.github.io/p5.Framebuffer/examples/simple

### Framebuffer objects

Methods:
- `Framebuffer.prototype.resizeCanvas(width: number, height: number)`
  - Resizes the Framebuffer to the specified size
  - This turns off autosizing to match the canvas size
- `Framebuffer.prototype.autoSized()`
  - Returns whether or not the framebuffer will automatically match the canvas's size
- `Framebuffer.prototype.autoSized(shouldAutoSize: boolean)`
  - Sets whether or not the framebuffer should automatically match the canvas's size
- `Framebuffer.prototype.pixelDensity()`
  - Returns the current pixel density of the framebuffer
- `Framebuffer.prototype.pixelDensity(targetDensity: number)`
  - Sets the pixel density of the framebuffer
  - This also turns off autosizing
- `Framebuffer.prototype.defaultCamera()`
  - Returns the camera associated with the framebuffer by default
- `Framebuffer.prototype.createCamera()`
  - Returns a new `p5.Camera` that matches the current dimensions of the framebuffer

An example of changing the size: https://davepagurek.github.io/p5.Framebuffer/examples/sizes

### WebGL 1

By default, this library will use WebGL 2 instead of WebGL 1. To use WebGL 1 mode, add this to the top of your sketch:

```js
Framebuffer.forceWebGL1 = true
```

Note: Antialiasing in WebGL 1 mode works by rendering at 2x resolution instead of using a multisampled texture at 1x resolution.

Compare the resulting quality using WebGL 1 vs 2 in this example: https://davepagurek.github.io/p5.Framebuffer/examples/formats

### Floating point textures

Sometimes, you want to write code that adds on to or modifies the previous frame. You may notice weird artifacts that show up due to the fact that colors are internally stored as integers: sometimes if you overlay a color with a very small alpha, the change in color is too small to round the resulting color up to the next integer value, so it doesn't change at all.

This can be fixed if you store colors as floating point values! You can specify this in an optional options object when creating a Framebuffer object.

<table>
<tr>
<td rowspan="4">

```js
let fboPrev, fboNext
let canvas

function setup() {
  canvas = createCanvas(400, 400, WEBGL)
  // There's a bug in Firefox where you can only make floating point textures
  // if they're RGBA, and it breaks if it's just RGB
  setAttributes({ alpha: true })

  // Try changing `float` to `unsigned_byte` to see it leave a trail
  options = { colorFormat: 'float' }
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
```


</td>
<th>
With <code>colorFormat: 'float'</code>
</th>
</tr>
<tr>
<td>
<img src="https://user-images.githubusercontent.com/5315059/178152103-07914de2-d09f-423f-99cc-84f83c422e8b.png">
</td>
</tr>
<tr>
<th>
With <code>colorFormat: 'unsigned_byte'</code> (the default)
</th>
</tr>
<tr>
<td>
<img src="https://user-images.githubusercontent.com/5315059/178152105-756356b0-d741-42b6-a460-9b7b2b571f16.png">
</td>
</tr>
</table>


Methods:
- `p5.prototype.createFramebuffer(options?: Options)`
  - `options.colorFormat: 'float' | 'unsigned_byte'`
    - Specify whether to use floating point storage for the color texture
    - Defaults to `'unsigned_byte'`
    - Note: If you use floating point colors, in Firefox you must also call `setAttributes({ alpha: true })`

### Depth of field blur

The library provides a helper that bundles a Framebuffer with a shader that applies focal blur, leaving objects at a provided distance in focus and blurring things more the farther away from that  point they are.

Create a blur renderer and draw inside its `draw` callback. When you tell it to `focusHere()`, anything drawn at that transformed position will be in focus. You can use standard p5 `translate` calls to position the focal point.

#### Gaussian blur

This is likely the best-looking blur renderer, although it uses two render passes. Start by using this one, but look out the other `BlurRenderer` if it's slow.

<table>
<tr>
<td>

```js
let blurRenderer

function setup() {
  createCanvas(400, 400, WEBGL)
  blurRenderer = createGaussianBlurRenderer()
  blurRenderer.setIntensity(0.15)
  blurRenderer.setSamples(20)
  blurRenderer.setDof(50)
}

function draw() {
  blurRenderer.draw(() => {
    clear()
    push()
    background(255)
    noStroke()
    lights()

    push()
    fill('blue')
    translate(-80, -80, -300)
    blurRenderer.focusHere()
    sphere(50)
    pop()

    push()
    fill('red')
    sphere(50)
    pop()
    pop()
  })
}
```

</td>
<td>
<img src="https://user-images.githubusercontent.com/5315059/201497333-92a3f46e-91b7-4d4e-a675-f958d8d9ff50.png" width="400">
</td>
</tr>
</table>

Methods on `GaussianBlurRenderer`:
- `GaussianBlurRenderer.prototype.draw(callback: () => void)`
  - Draw the scene defined in the callback with blur
- `GaussianBlurRenderer.prototype.focusHere()`
  - Tell the renderer what point in space should be in focus. It will move based on any calls to `translate()` or other transformations that you have applied.
  - Defaults to the origin
- `GaussianBlurRenderer.prototype.setIntensity(intensity: number)`
  - Control the intensity of the blur, between 0 and 1: the lower the intensity, the farther objects have to be from the focal point to be blurred
  - Defaults to 0.1
- `GaussianBlurRenderer.prototype.setDof(dof: number)`
  - Control the depth of field (dof), which is the distance away from the focal point that is also in focus, from 0 up
  - The lower the dof, the smaller range will be that has no blur. Blur amount will start to accumulate when objects are outside of the dof range
  - The focal target (set by `focusHere`) is located in the centre of the clear range. So assume the focal target's depth value is `z`, then the clear range becomes from `z - dof / 2` to `z + dof / 2`.
  - Defaults to 0
- `GaussianBlurRenderer.prototype.setSamples(numSamples: number)`
  - Control how many random samples to use in the blur shader. More samples will look smoother but is more computationally intensive.
  - Defaults to 20

A live example: https://davepagurek.github.io/p5.Framebuffer/examples/gaussianblur


#### One-pass blur

Another implementation of blur, but using a single shader pass. This will likely produce a grainier result, but might be faster on some systems.

<table>
<tr>
<td>

```js
let blurRenderer

function setup() {
  createCanvas(400, 400, WEBGL)
  blurRenderer = createBlurRenderer()
}

function draw() {
  blurRenderer.draw(() => {
    clear()
    push()
    background(255)
    noStroke()
    lights()

    push()
    fill('blue')
    translate(-80, -80, -300)
    blurRenderer.focusHere()
    sphere(50)
    pop()

    push()
    fill('red')
    sphere(50)
    pop()
    pop()
  })
}
```

</td>
<td>
<img src="https://user-images.githubusercontent.com/5315059/178128839-164de943-960c-4e0a-ba6a-a7aa836ec798.png">
</td>
</tr>
</table>

Methods on `BlurRenderer`:
- `BlurRenderer.prototype.draw(callback: () => void)`
  - Draw the scene defined in the callback with blur
- `BlurRenderer.prototype.focusHere()`
  - Tell the renderer what point in space should be in focus. It will move based on any calls to `translate()` or other transformations that you have applied.
  - Defaults to the origin
- `BlurRenderer.prototype.setIntensity(intensity: number)`
  - Control the intensity of the blur, between 0 and 1: the lower the intensity, the farther objects have to be from the focal point to be blurred
  - Defaults to 0.05
- `BlurRenderer.prototype.setDof(dof: number)`
  - Control the depth of field (dof), which is the distance away from the focal point that is also in focus, from 0 up
  - The lower the dof, the smaller range will be that has no blur. Blur amount will start to accumulate when objects are outside of the dof range
  - The focal target (set by `focusHere`) is located in the centre of the clear range. So assume the focal target's depth value is `z`, then the clear range becomes from `z - dof / 2` to `z + dof / 2`.
  - Defaults to 0
- `BlurRenderer.prototype.setSamples(numSamples: number)`
  - Control how many random samples to use in the blur shader. More samples will look smoother but is more computationally intensive.
  - Defaults to 15

A live example: https://davepagurek.github.io/p5.Framebuffer/examples/blur

### Contact Shadows

The library provides a helper that bundles a Framebuffer with a shader that applies Ambient Occlusion shadows. This approximates the shadows one would see if there was uniform light hitting an object from all sides. In practice, it adds shadows in areas where objects get close to each other.

Create a shadow renderer and draw inside its `draw` callback. The renderer will add shadows to the result.

<table>
<tr>
<td>

```js
let contactShadowRenderer

function setup() {
  createCanvas(400, 400, WEBGL)
  contactShadowRenderer = createContactShadowRenderer()
}

function draw() {
  contactShadowRenderer.draw(() => {
    clear()
    push()
    background(255)
    fill(255)
    noStroke()
    lights()

    push()
    translate(50, -50, 10)
    sphere(50)
    pop()

    push()
    translate(-50, 50, -10)
    sphere(90)
    pop()
  })
}
```

</td>
<td>
<img src="https://user-images.githubusercontent.com/5315059/178128655-22816bcd-901d-49b5-95db-753815762805.png">
</td>
</tr>
</table>

Methods on `ContactShadowRenderer`:
- `ContactShadowRenderer.prototype.draw(callback: () => void)`
  - Draw the scene defined in the callback with shadows added
- `ContactShadowRenderer.prototype.setIntensity(intensity: number)`
  - Control how dark shadows are: 0 is no shadows, and 1 is full darkness
  - Defaults to 0.5
- `ContactShadowRenderer.prototype.setShadowSamples(numSamples: number)`
  - Control how many random samples to use in the shadow shader. More samples will be more accurate but is more computationally intensive.
  - Defaults to 15
- `ContactShadowRenderer.prototype.setBlurSamples(numSamples: number)`
  - Control how many random samples to use in the blur shader. More samples will be smoother but is more computationally intensive.
  - Defaults to 20
- `ContactShadowRenderer.prototype.setBlurRadius(radius: number)`
  - Sets how far the blur extends when blurring shadows, in pixels, ignoring the pixel density
  - Defaults to 50
- `ContactShadowRenderer.prototype.setSearchRadius(radius: number)`
  - Control how close together objects need to be for them to cast shadows
  - This is defined in *world space,* meaning all transformations are applied when checking distances
  - Defaults to 100

A live example: https://davepagurek.github.io/p5.Framebuffer/examples/shadows

## External examples

- <a href="https://openprocessing.org/sketch/1773564">Rolling Shutter</a>
  - Uses 120 framebuffers to store previous frames of video for a slit scanning effect
- <a href="https://openprocessing.org/sketch/1721124">Wizard Pondering Orb</a>
  - Uses the Gaussian blur renderer
- <a href="https://openprocessing.org/sketch/1616318">3D Text</a>
  - Uses two framebuffers to do a feedback effect
- <a href="https://openprocessing.org/sketch/1622863">Disassemble</a>
  - Uses the contact shadow renderer
- <a href="https://openprocessing.org/sketch/1590159">Train Knots</a>
  - Uses the depth buffer in a focal blur shader
- <a href="https://openprocessing.org/sketch/1460113">Modern Vampires of the City</a>
  - Uses the depth buffer to create a fog effect

More coming soon!
