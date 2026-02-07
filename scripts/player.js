/**
 * Gets songs from S3 Object Storage through REST API and puts in the custom WEB-player.
 */
const DOM = {
  overlay: document.querySelector('.overlay'),
  audio: document.querySelector('.audio'),
  songName: document.querySelector('.song-name'),
  toggleButton: document.querySelector('.toggle-button'),
  time: document.querySelector('.current-time'),
  volumeButton: document.querySelector('.volume-button'),
  progress: document.querySelector('.progress'),
  volume: document.querySelector('.volume-regulator'),
  canvas: document.querySelector('.canvas'),
  spinner: document.querySelector('.load-spinner'),
}
const { BUCKET, ENDPOINT, SUBPATH, ACCESS_KEY, SECRET_KEY } = window.APP_CONFIG
const Player = {
  songs: [],
  index: 0,
  isLoading: true,
}
const Audio = {
  context: null,
  analyzer: null,
  gainNode: null,
  lastVolume: 0.5,
  isSeeking: false,
  seekTimeout: null,
  config: {
    fftSize: 512,
    minDecibels: -90,
    smoothingTimeConstant: 0.75,
  },

  init() {
    if (!this.context) {
      this.context = new AudioContext()
      const src = this.context.createMediaElementSource(DOM.audio)

      this.analyzer = this.context.createAnalyser()
      this.analyzer.fftSize = this.config.fftSize
      this.analyzer.minDecibels = this.config.minDecibels
      this.analyzer.smoothingTimeConstant = this.config.smoothingTimeConstant

      this.gainNode = this.context.createGain()
      src.connect(this.gainNode)
      this.gainNode.connect(this.analyzer)
      this.analyzer.connect(this.context.destination)

      Object.assign(this.analyzer, this.config)
      this.gainNode.gain.value = this.lastVolume

      Visualizer.init()
    }
  },

  resume() {
    if (this.context?.state === 'suspended') {
      this.context.resume()
    }
  },

  setVolume(value) {
    this.lastVolume = value

    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(value, this.context.currentTime, 0.01)
    }
  },
}

const Visualizer = {
  running: false,
  samplingPaused: true,
  context: null,
  canvas: null,
  canvasOptions: {
    innerHeight: null,
    innerWidth: null,
    capHeight: 2,
    barWidth: 13,
    barHeight: null,
    barSpacing: 25,
    barCount: null,
    styles: null,
    frequencyUpper: null,
    frequencyLimit: null,
  },
  dpr: 1,
  colors: {
    cap: '#fff',
    barTop: '#0f3443',
    barMiddle: '#1b8d93ff',
    barBottom: '#54d1daff',
  },
  frequencyData: null,
  decayData: null,

  setupContext() {
    this.canvas = this.canvas || DOM.canvas
    this.dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * this.dpr
    this.canvas.height = rect.height * this.dpr
    const ctx = this.canvas.getContext('2d')
    ctx.scale(this.dpr, this.dpr)

    this.context = ctx
  },

  initializeOptions() {
    const innerHeight = this.canvas.height / this.dpr
    const innerWidth = this.canvas.width / this.dpr
    const barHeight = innerHeight - this.canvasOptions.capHeight
    const barCount = Math.round(innerWidth / this.canvasOptions.barSpacing)
    const styles = {
      capStyle: this.colors.cap,
      gradient: (() => {
        const g = this.context.createLinearGradient(0, barHeight, 0, 0)

        g.addColorStop(1, this.colors.barTop)
        g.addColorStop(0.5, this.colors.barMiddle)
        g.addColorStop(0, this.colors.barBottom)
        return g
      })(),
    }

    const frequencyUpper = (Audio.context?.sampleRate || 44100) / 2
    const frequencyLimit = Math.min(16e3, frequencyUpper)

    Object.assign(this.canvasOptions, {
      innerHeight,
      innerWidth,
      barHeight,
      barCount,
      styles,
      frequencyUpper,
      frequencyLimit,
    })
  },

  init() {
    this.setupContext()
    this.initializeOptions()

    if (!this.frequencyData) {
      this.frequencyData = new Uint8Array(Audio.analyzer.frequencyBinCount)
      this.decayData = new Float32Array(Audio.analyzer.frequencyBinCount)
    }

    if (!this.running) {
      this.running = true
      this.render()
    }
  },

  updateCanvasParameters() {
    this.setupContext()
    this.initializeOptions()
  },

  drawFrame() {
    if (!this.canvasOptions || !Audio.analyzer) return

    const ctx = this.context
    const opts = this.canvasOptions

    ctx.clearRect(0, 0, opts.innerWidth, opts.innerHeight)

    const decay = this.decayData

    const step =
      (decay.length * (opts.frequencyLimit / opts.frequencyUpper) - 1) /
      (opts.barCount - 1)

    for (let i = 0; i < opts.barCount; i++) {
      const value = decay[Math.floor(i * step)] / 255
      const x = opts.barSpacing * (i + 0.5)

      if (x + opts.barWidth < opts.innerWidth) {
        ctx.fillStyle = opts.styles.gradient
        ctx.fillRect(
          x,
          opts.barHeight * (1 - value) + opts.capHeight,
          opts.barWidth,
          opts.barHeight * value,
        )

        ctx.fillStyle = opts.styles.capStyle
        ctx.fillRect(
          x,
          opts.barHeight * (1 - value),
          opts.barWidth,
          opts.capHeight,
        )
      }
    }
  },

  render() {
    if (this.running) {
      const canSample = !DOM.audio.paused && !Audio.isSeeking && !isMuted()

      if (canSample) {
        Audio.analyzer.getByteFrequencyData(this.frequencyData)
      }

      let isActive = false

      for (let i = 0; i < this.decayData.length; i++) {
        const input = canSample ? this.frequencyData[i] : 0
        this.decayData[i] = Math.max(input, this.decayData[i] * 0.92)

        if (!isActive && this.decayData[i] > 1) {
          isActive = true
        }
      }

      if (isActive || canSample) {
        this.drawFrame()
        requestAnimationFrame(this.render.bind(this))
      } else {
        this.running = false
      }
    }
  },
}

const S3 = {
  client: null,

  isPrivate() {
    return ACCESS_KEY && SECRET_KEY
  },

  init() {
    if (this.client) return

    if (this.isPrivate()) {
      AWS.config.update({
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
      })
    }

    this.client = new AWS.S3({
      endpoint: 'https://' + ENDPOINT,
    })
  },

  listSongs() {
    return new Promise((resolve, reject) => {
      this.init()

      const received = []
      const subpathRegexp = new RegExp(SUBPATH, 'g')

      const params = { Bucket: BUCKET }

      const cb = (err, data) => {
        if (err) {
          reject(err)
          return
        }

        data.Contents.forEach((song) => {
          const key = song.Key.replace(subpathRegexp, '')
          if (key.endsWith('.mp3')) received.push(key)
        })

        resolve(received)
      }

      if (this.isPrivate()) {
        this.client.listObjects(params, cb)
      } else {
        this.client.makeUnauthenticatedRequest('listObjects', params, cb)
      }
    })
  },

  getSongUrl(title) {
    if (this.isPrivate()) {
      return this.client.getSignedUrl('getObject', {
        Bucket: BUCKET,
        Key: SUBPATH + title,
        Expires: 1800,
      })
    } else {
      return `https://${BUCKET}.${ENDPOINT}${SUBPATH}${title}`
    }
  },
}

const titleReplaces = [
  // List of title transitions.
  { from: '.mp3', to: '' },
  { from: 'AC_DC', to: 'AC/DC' },
]

window.AudioContext = // Automatic detection of webkit.
  window.AudioContext || window.webkitAudioContext || window.mozAudioContext

DOM.audio.volume = 1

/**
 * Shuffles music after getting through API call.
 * @param {string[]} songs. Array of songs' names received from Object Storage.
 */
function shuffleMusic(songs) {
  DOM.audio.currentTime = 0
  navigator.mediaSession.playbackState = 'paused'
  Player.songs = songs

  let remaining = songs.length, // Fisher-Yates shuffle algorithm
    index,
    temp

  while (remaining > 0) {
    index = Math.floor(Math.random() * remaining)
    remaining--
    temp = Player.songs[remaining]
    Player.songs[remaining] = Player.songs[index]
    Player.songs[index] = temp
  }

  Player.index = 0

  showFirst()
}

/**
 * Loads the first element of shuffled song list to the HTML. Also turns off the overlay.
 */
function showFirst() {
  DOM.progress.value = 0

  if (
    navigator.mediaSession.playbackState === 'paused' &&
    DOM.audio.src === ''
  ) {
    updateTitle()
    disableLoader()

    DOM.audio.src = songUrl(Player.songs[0])
    DOM.songName.style.display = 'inline-block'
  }
}

/**
 * Shows loader spinner at the very beginning.
 */
function initLoader() {
  DOM.overlay.style.display = 'block'
  DOM.spinner.style.display = 'block'
}

/**
 * Disables shadowing of background and loader spinner.
 */
function disableLoader() {
  DOM.overlay.style.display = 'none'
  DOM.spinner.style.display = 'none'
}

/**
 * Updates session data on changing of song.
 * @param {string} title. Song[i].Key (title of song).
 */
function updateMetadata(fullTitle, year) {
  if ('mediaSession' in navigator) {
    let captureGroups = fullTitle.split(/\s-\s/)

    navigator.mediaSession.metadata = new MediaMetadata({
      artist: captureGroups[0],
      title: captureGroups[1],
      artwork: [
        {
          src: 'https://i1.wp.com/edgeeffects.net/wp-content/uploads/2021/03/The_Earth_seen_from_Apollo_17.jpg?ssl=1',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
      album: year, // Put year in album field cause there is no such field sadly
    })
  }
}

/**
 * Performs title transformations.
 * @param {string} title. Initial name of song with extensions.
 * @return {string} preparedTitle
 */
function prepareTitle(title) {
  return titleReplaces.reduce((p, c) => p.replace(c.from, c.to), title)
}

/**
 * Updates title of song on switch. Also removes extension from the title.
 */
function updateTitle() {
  const preparedTitleWithYear = prepareTitle(Player.songs[Player.index])

  const [fullTitle, possibleYear] = preparedTitleWithYear
    .split(/(\d{4})$/)
    .map((v) => (v ? v.trim() : v))

  DOM.songName.innerHTML = fullTitle
  updateMetadata(fullTitle, possibleYear)
}

/**
 * Handles song index when switching from last song in list to the first and vice versa.
 * @param {number} index. Current song index.
 * @param {number} length. Length of song list.
 * @return {number} normalized index.
 */
function normalizeSongIndex(index, length) {
  if (index >= length) {
    return 0
  } else if (index < 0) {
    return length - 1
  } else {
    return index
  }
}

/**
 * Sets the logic of toggle button. Also opens/closes contexts.
 */
function toggleMusic() {
  if (DOM.audio.src != '' && DOM.audio.paused) {
    playCurrentSong()
  } else if (DOM.audio.src != '' && !DOM.audio.paused) {
    pauseSong()
  }
}

/**
 * Updates audio source to load song by index.
 * @param {number} index. Index of song to load.
 */
function loadSong(index) {
  DOM.audio.pause()
  DOM.audio.src = songUrl(Player.songs[index])
  DOM.audio.load()
}

/**
 * Starts playing current song.
 */
function playCurrentSong() {
  Audio.init()
  Audio.resume()
  DOM.audio.play().catch(() => {})
  navigator.mediaSession.playbackState = 'playing'
}

/**
 * Pauses current song.
 */
function pauseSong() {
  DOM.audio.pause()
  navigator.mediaSession.playbackState = 'paused'
}

/**
 * Updates song on changing of index.
 */
function changeSong() {
  navigator.mediaSession.playbackState = 'paused'

  loadSong(Player.index)
  updateTitle()
  playCurrentSong()
}

/**
 * Sets the logic of next song button. Also changes visuals.
 */
function nextSong() {
  incrementSong()
  changeSong()
}

/**
 * Sets the logic of previous song button. Also visual changes.
 */
function previousSong() {
  decrementSong()
  changeSong()
}

/**
 * Based on current timing of audio component fill the text area left of position element.
 */
function updateDisplayedTime() {
  if (Math.floor(DOM.audio.currentTime % 60) < 10)
    DOM.time.innerHTML =
      Math.floor(DOM.audio.currentTime / 60) +
      ':0' +
      Math.floor(DOM.audio.currentTime % 60)
  else
    DOM.time.innerHTML =
      Math.floor(DOM.audio.currentTime / 60) +
      ':' +
      Math.floor(DOM.audio.currentTime % 60)
}

/**
 * @returns {bool}. Whether bucket public or private
 */
function isBucketPrivate() {
  return ACCESS_KEY && SECRET_KEY
}

/**
 * Gets signed or direct url via GET request using 'Key' parameter.
 * @param {string} title. Song[i].Key (title of song).
 * @return {string} url. Signed url for audio.src.
 */
function songUrl(title) {
  return S3.getSongUrl(title)
}

/**
 * Requests songs' data from bucket.
 */
async function requestSongs() {
  try {
    const songs = await S3.listSongs()
    shuffleMusic(songs)
  } catch (err) {
    console.error('Error fetching songs from S3:', err)
  }
}

/**
 * Increment current song index.
 */
function incrementSong() {
  Player.index = normalizeSongIndex(Player.index + 1, Player.songs.length)
}

/**
 * Decrement current song index.
 */
function decrementSong() {
  Player.index = normalizeSongIndex(Player.index - 1, Player.songs.length)
}

/**
 * Switches to the next song if the previous has ended.
 */
function nextSongOnEnd() {
  incrementSong()
  updateTitle()

  DOM.audio.src = songUrl(Player.songs[Player.index])
  DOM.audio.play()
}

/**
 * Moves slider according to current time.
 */
function moveSlider() {
  if (DOM.audio.currentTime === 0) {
    DOM.progress.value = 1
  } else {
    DOM.progress.value = (DOM.audio.currentTime * 100) / DOM.audio.duration
  }

  updateDisplayedTime()
}

/**
 * Checks whether the audio is muted.
 */
function isMuted() {
  const vol = DOM.volume ? Number(DOM.volume.value) : Audio.lastVolume
  return vol < 0.001
}

/**
 * Toggles the mute icon according to the volume.
 */
function updateVolumeButtonIcon() {
  DOM.volumeButton.src = isMuted() ? 'assets/mute.png' : 'assets/volume.png'
}

/**
 * Changes the volume according to the slider position.
 */
function changeVolume() {
  const vol = Number(DOM.volume.value)
  Audio.lastVolume = vol

  if (!Audio.gainNode || !Audio.context) {
    Audio.init()
  }

  if (!isMuted() && !Visualizer.running) {
    Visualizer.init()
  }

  Audio.gainNode.gain.setTargetAtTime(vol, Audio.context.currentTime, 0.01)
  updateVolumeButtonIcon()
}

/**
 * Toggles mute on click.
 */
function toggleMute() {
  if (!Audio.gainNode || !Audio.context) {
    Audio.init()
    return
  }

  Audio.gainNode.gain.cancelScheduledValues(Audio.context.currentTime)

  if (Audio.gainNode.gain.value > 0.001) {
    Audio.lastVolume = Audio.gainNode.gain.value
    Audio.gainNode.gain.setTargetAtTime(0, Audio.context.currentTime, 0.04)
    DOM.volume.value = 0
  } else {
    Audio.gainNode.gain.setTargetAtTime(
      Audio.lastVolume,
      Audio.context.currentTime,
      0.04,
    )
    DOM.volume.value = Audio.lastVolume
    if (!Visualizer.running) {
      Visualizer.init()
    }
  }

  updateVolumeButtonIcon()
}

/**
 * Updates play/pause icon based on slider value.
 */
function updatePlayIcon() {
  DOM.toggleButton.src = DOM.audio.paused
    ? 'assets/play.png'
    : 'assets/pause.png'
}

/**
 * Adds all necessary event listeners.
 */
function addListeners() {
  let resizeTimeout
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(() => Visualizer.updateCanvasParameters(), 25)
  })

  DOM.audio.addEventListener('ended', nextSongOnEnd)
  DOM.audio.addEventListener('timeupdate', moveSlider)
  DOM.audio.addEventListener('play', () => {
    Visualizer.samplingPaused = false

    if (!Visualizer.running) {
      Visualizer.init()
    }

    updatePlayIcon()
  })

  DOM.audio.addEventListener('pause', () => {
    Visualizer.samplingPaused = true

    updatePlayIcon()
  })

  DOM.audio.addEventListener('seeking', () => {
    Audio.isSeeking = true

    if (!Audio.gainNode || !Audio.context) return

    Audio.gainNode.gain.cancelScheduledValues(Audio.context.currentTime)
    Audio.gainNode.gain.setValueAtTime(
      Audio.lastVolume,
      Audio.context.currentTime,
    )

    Visualizer.samplingPaused = true
  })

  DOM.audio.addEventListener('seeked', async () => {
    Audio.isSeeking = false

    if (Audio.context && Audio.context.state !== 'running') {
      try {
        await Audio.context.resume() // Safari may auto-suspend, so resume
      } catch (err) {
        console.warn('AudioContext resume failed after seek', err)
      }
    }

    Visualizer.samplingPaused = DOM.audio.paused

    if (Audio.gainNode) {
      Audio.gainNode.gain.setTargetAtTime(
        Number(DOM.volume.value),
        Audio.context.currentTime,
        0.03,
      )
    }
  })

  DOM.progress.addEventListener('input', () => {
    if (Audio.seekTimeout) clearTimeout(Audio.seekTimeout)

    Audio.seekTimeout = setTimeout(() => {
      if (!DOM.audio.duration) return

      Audio.isSeeking = true
      Visualizer.samplingPaused = true
      DOM.audio.currentTime = (DOM.audio.duration / 100) * DOM.progress.value
    }, 20)
  })

  DOM.volumeButton.addEventListener('click', toggleMute)
  DOM.volume.addEventListener('input', changeVolume)

  navigator.mediaSession.setActionHandler('previoustrack', previousSong)
  navigator.mediaSession.setActionHandler('nexttrack', nextSong)
  navigator.mediaSession.setActionHandler('pause', toggleMusic)
  navigator.mediaSession.setActionHandler('play', toggleMusic)
}

/**
 * The boot and the listeners' logic.
 */
window.addEventListener('load', () => {
  initLoader()
  S3.init()
  requestSongs()
  addListeners()
})
