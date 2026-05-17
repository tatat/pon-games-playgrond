// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { InputManager } from './index'

function press(code: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
}

function release(code: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }))
}

describe('InputManager', () => {
  it('isDown is true while a bound key is held', () => {
    const im = new InputManager({ left: ['ArrowLeft', 'KeyA'] })
    expect(im.isDown('left')).toBe(false)
    press('ArrowLeft')
    expect(im.isDown('left')).toBe(true)
    release('ArrowLeft')
    expect(im.isDown('left')).toBe(false)
    im.dispose()
  })

  it('accepts any of the bound key codes', () => {
    const im = new InputManager({ left: ['ArrowLeft', 'KeyA'] })
    press('KeyA')
    expect(im.isDown('left')).toBe(true)
    release('KeyA')
    expect(im.isDown('left')).toBe(false)
    im.dispose()
  })

  it('wasJustPressed fires once per press until endFrame', () => {
    const im = new InputManager({ jump: ['Space'] })
    press('Space')
    expect(im.wasJustPressed('jump')).toBe(true)
    expect(im.wasJustPressed('jump')).toBe(true) // still true within same frame
    im.endFrame()
    expect(im.wasJustPressed('jump')).toBe(false)
    im.dispose()
  })

  it('does not refire wasJustPressed on key auto-repeat', () => {
    const im = new InputManager({ jump: ['Space'] })
    press('Space')
    im.endFrame()
    press('Space') // OS auto-repeat keydown while still held
    expect(im.wasJustPressed('jump')).toBe(false)
    im.dispose()
  })

  it('virtual press makes the action active without a key event', () => {
    const im = new InputManager({ shoot: ['KeyF'] })
    expect(im.isDown('shoot')).toBe(false)
    im.press('shoot')
    expect(im.isDown('shoot')).toBe(true)
    expect(im.wasJustPressed('shoot')).toBe(true)
    im.release('shoot')
    expect(im.isDown('shoot')).toBe(false)
    im.dispose()
  })

  it('isDown returns true if either keyboard or virtual is held', () => {
    const im = new InputManager({ left: ['ArrowLeft'] })
    press('ArrowLeft')
    im.press('left')
    expect(im.isDown('left')).toBe(true)
    release('ArrowLeft')
    expect(im.isDown('left')).toBe(true) // virtual still held
    im.release('left')
    expect(im.isDown('left')).toBe(false)
    im.dispose()
  })

  it('unknown action returns false', () => {
    const im = new InputManager({ left: ['ArrowLeft'] })
    expect(im.isDown('nope')).toBe(false)
    expect(im.wasJustPressed('nope')).toBe(false)
    im.dispose()
  })

  it('dispose removes listeners and clears state', () => {
    const im = new InputManager({ left: ['ArrowLeft'] })
    press('ArrowLeft')
    im.press('virtual')
    im.dispose()
    // Listeners should be gone — pressing again no longer registers.
    press('ArrowLeft')
    expect(im.isDown('left')).toBe(false)
    expect(im.isDown('virtual')).toBe(false)
  })
})
