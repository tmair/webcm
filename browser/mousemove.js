let mouse_delay = 200
let mouse_timeout

const round = (n, decPlaces = 4) => {
  const factor = 10 ** decPlaces
  return Math.floor(n * factor) / factor
}

const getMousePosition = async event => {
  const { clientX, clientY, pageX, pageY, target } = event
  const { left, top, width, height } = target.getBoundingClientRect()

  const payload = {
    mousemoves: [
      {
        clientX,
        clientY,
        pageX,
        pageY,
        target,
        relativeX: round(((clientX - left) / width) * 100),
        relativeY: round(((clientY - top) / height) * 100),
      },
    ],
  }
  webcm.track({ event: 'mousemove', payload }, 1)
}

window.addEventListener('mousemove', event => {
  clearTimeout(mouse_timeout)
  mouse_timeout = setTimeout(getMousePosition, mouse_delay, event)
})
