/**
 * Gets songs from S3 Object Storage through REST API and sets up the player.
 */

const $ = (selector) => {
  const el = document.querySelector(selector)
  if (!el) {
    throw new Error(`Element not found for selector: ${selector}`)
  }
  return el
}

const DOM = {
  overlay: $('.overlay'),
  audio: $('.audio'),
  songName: $('.song-name'),
  toggleButton: $('.toggle-button'),
  time: $('.current-time'),
  volumeButton: $('.volume-button'),
  progress: $('.progress'),
  volume: $('.volume-regulator'),
  canvas: $('.canvas'),
  spinner: $('.load-spinner'),
  lyricsButton: $('.toggle-lyrics-button'),
  lyricsPanel: $('.lyrics-panel'),
  lyricsContent: $('.lyrics-content'),
  lyricsText: $('.lyrics-text'),
  toggleBarsButton: $('.toggle-bars-button'),
  shuffleButton: $('.shuffle-button'),
  queuePanel: $('.queue-panel'),
  queueList: $('.queue-list'),
  queueSearch: $('.queue-search'),
  queueButton: $('.toggle-queue-button'),
}
const {
  FORCE_PATH_STYLE,
  BUCKET,
  ENDPOINT,
  SUBPATH,
  METADATA,
  ACCESS_KEY,
  SECRET_KEY,
} = window.APP_CONFIG
const Player = {
  songs: [],
  originalSongs: [],
  songIndex: new Map(),
  index: 0,
  baseIndex: 0,
  isLoading: true,
}
const Search = {
  visible: false,
  searchQuery: '',
}
const Queue = {
  items: [],
}
const Lyrics = {
  current: null,
  visible: false,
  cache: {},
  metadataFiles: null,
}
const Audio = {
  context: null,
  analyzer: null,
  gainNode: null,
  lastVolume: 0.5,
  isSeeking: false,
  wasPlayingBeforeSeek: false,
  pendingSeek: null,
  config: {
    fftSize: 512,
    minDecibels: -90,
    maxDecibels: -10,
    smoothingTimeConstant: 0.7,
  },

  init() {
    if (!this.context) {
      this.context = new AudioContext()
      const src = this.context.createMediaElementSource(DOM.audio)

      this.analyzer = this.context.createAnalyser()
      this.analyzer.fftSize = this.config.fftSize
      this.analyzer.minDecibels = this.config.minDecibels
      this.analyzer.maxDecibels = this.config.maxDecibels
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

const isMobile = window.matchMedia('(pointer: coarse)').matches

const supportedFormats = ['.mp3', '.ogg', '.wav', '.flac']
const supportedFormatsRegexp = new RegExp(
  `\\.(${supportedFormats.map((f) => f.slice(1)).join('|')})$`,
  'i',
)

const Visualizer = {
  rafId: null,
  context: null,
  canvas: null,
  canvasOptions: {
    innerHeight: null,
    innerWidth: null,
    capHeight: 2,
    barWidth: 6,
    barHeight: null,
    barSpacing: 12,
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
    ringFrom: '#34f4a4',
    ringTo: '#34b4f4',
  },
  frequencyData: null,
  decayData: null,
  stopped: false,

  /**
   * Parses '#rrggbb' into { r, g, b } integer channels.
   */
  hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    }
  },

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
    const barCount = isMobile
      ? 96
      : Math.round(innerWidth / this.canvasOptions.barSpacing)
    const styles = {
      capStyle: this.colors.cap,
      ringFrom: this.hexToRgb(this.colors.ringFrom),
      ringTo: this.hexToRgb(this.colors.ringTo),
      gradient: (() => {
        const g = this.context.createLinearGradient(0, barHeight, 0, 0)

        g.addColorStop(1, this.colors.barTop)
        g.addColorStop(0.5, this.colors.barMiddle)
        g.addColorStop(0, this.colors.barBottom)
        return g
      })(),
    }

    const frequencyUpper = (Audio.context?.sampleRate || 44100) / 2
    const frequencyLimit = Math.min(12e3, frequencyUpper)

    const centerX = innerWidth / 2
    const centerY = innerHeight / 2
    const baseRadius = Math.min(innerWidth, innerHeight) * 0.2
    const maxAmplitude = Math.min(innerWidth, innerHeight) * 0.29

    Object.assign(this.canvasOptions, {
      innerHeight,
      innerWidth,
      barHeight,
      barCount,
      styles,
      frequencyUpper,
      frequencyLimit,
      centerX,
      centerY,
      baseRadius,
      maxAmplitude,
    })
  },

  init() {
    this.setupContext()
    this.initializeOptions()

    if (!this.frequencyData) {
      this.frequencyData = new Uint8Array(Audio.analyzer.frequencyBinCount)
      this.decayData = new Float32Array(Audio.analyzer.frequencyBinCount)
    }
  },

  updateCanvasParameters() {
    this.setupContext()
    this.initializeOptions()
  },

  drawFrame() {
    if (this.canvasOptions && Audio.analyzer) {
      if (isMobile) {
        this.drawCircleFrame()
      } else {
        this.drawBarsFrame()
      }
    }
  },

  /**
   * Circular visualization for mobile: radial bars with rounded caps
   * radiating from a base ring, hue shifting around the circle.
   */
  drawCircleFrame() {
    const ctx = this.context
    const opts = this.canvasOptions
    const decay = this.decayData

    ctx.clearRect(0, 0, opts.innerWidth, opts.innerHeight)

    const time = performance.now() / 1000
    const usableBins =
      decay.length * (opts.frequencyLimit / opts.frequencyUpper) - 1
    const rotation = time * 0.08
    const minLength = 4

    ctx.lineCap = 'round'
    ctx.lineWidth = ((2 * Math.PI * opts.baseRadius) / opts.barCount) * 0.5

    for (let i = 0; i < opts.barCount; i++) {
      const t = i / opts.barCount
      const angle = t * 2 * Math.PI + rotation - Math.PI / 2

      const freqRatio = t
      const raw = decay[Math.floor(freqRatio * usableBins)]
      const gamma = 1.0 - freqRatio * 0.6
      const value = Math.pow(raw / 255, gamma)

      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const outer = opts.baseRadius + minLength + value * opts.maxAmplitude

      const { ringFrom, ringTo } = opts.styles
      const mixT = (Math.sin(angle - Math.PI / 4) + 1) / 2
      const channel = (from, to) => {
        const mixed = from + (to - from) * mixT
        return Math.round(mixed + (255 - mixed) * value * 0.35)
      }

      ctx.strokeStyle =
        `rgb(${channel(ringFrom.r, ringTo.r)}, ` +
        `${channel(ringFrom.g, ringTo.g)}, ` +
        `${channel(ringFrom.b, ringTo.b)})`
      ctx.beginPath()
      ctx.moveTo(
        opts.centerX + cos * opts.baseRadius,
        opts.centerY + sin * opts.baseRadius,
      )
      ctx.lineTo(opts.centerX + cos * outer, opts.centerY + sin * outer)
      ctx.stroke()
    }
  },

  drawBarsFrame() {
    const ctx = this.context
    const opts = this.canvasOptions

    ctx.clearRect(0, 0, opts.innerWidth, opts.innerHeight)

    const decay = this.decayData

    const step =
      (decay.length * (opts.frequencyLimit / opts.frequencyUpper) - 1) /
      (opts.barCount - 1)

    const startX =
      (opts.innerWidth -
        (opts.barSpacing * (opts.barCount - 1) + opts.barWidth)) /
      2

    for (let i = 0; i < opts.barCount; i++) {
      const binIndex = Math.floor(i * step)
      const raw = decay[binIndex]

      const freqRatio = i / (opts.barCount - 1)
      const gamma = 1.0 - freqRatio * 0.6
      const value = Math.pow(raw / 255, gamma)
      const x = startX + opts.barSpacing * i

      if (x >= 0 && x + opts.barWidth <= opts.innerWidth) {
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

  computeDecay(decayData, frequencyData, canSample) {
    if (decayData) {
      const nextDecay = new Float32Array(decayData.length)
      let isActive = false

      for (let i = 0; i < decayData.length; i++) {
        const input = canSample ? frequencyData[i] : 0
        const val = Math.max(input, decayData[i] * 0.85)
        nextDecay[i] = val
        if (!isActive && val > 0.0001) {
          isActive = true
        }
      }

      return { nextDecay, isActive }
    } else {
      return { nextDecay: null, isActive: false }
    }
  },

  render() {
    const canSample = !DOM.audio.paused && !Audio.isSeeking && !isMuted()

    if (canSample) {
      Audio.analyzer.getByteFrequencyData(this.frequencyData)
    }

    const { nextDecay, isActive } = this.computeDecay(
      this.decayData,
      this.frequencyData,
      canSample,
    )

    this.decayData = nextDecay

    if (isActive || canSample) {
      this.drawFrame()
      this.rafId = requestAnimationFrame(this.render.bind(this))
    } else {
      this.stop()
    }
  },

  start() {
    if (!this.rafId) {
      this.render()
    }
  },

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  },
}

const S3 = {
  client: null,

  isPrivate() {
    return ACCESS_KEY && SECRET_KEY
  },

  init() {
    if (!this.client) {
      if (this.isPrivate()) {
        AWS.config.update({
          accessKeyId: ACCESS_KEY,
          secretAccessKey: SECRET_KEY,
        })
      }

      this.client = new AWS.S3({
        endpoint: 'https://' + ENDPOINT,
        s3ForcePathStyle: FORCE_PATH_STYLE,
        signatureVersion: 'v4',
        correctClockSkew: true,
      })
    }
  },

  listSongs() {
    return new Promise((resolve, reject) => {
      this.init()

      const received = []
      const subpathRegexp = new RegExp(SUBPATH, 'g')

      const params = { Bucket: BUCKET }

      const fetchBatch = (params) => {
        const cb = (err, data) => {
          if (err) {
            reject(err)
            return
          }

          data.Contents.forEach((song) => {
            const key = song.Key.replace(subpathRegexp, '')

            if (supportedFormatsRegexp.test(key)) {
              received.push(key)
            }
          })

          if (data.IsTruncated) {
            params.ContinuationToken = data.NextContinuationToken
            fetchBatch(params)
          } else {
            resolve(received)
          }
        }

        if (this.isPrivate()) {
          this.client.listObjectsV2(params, cb)
        } else {
          this.client.makeUnauthenticatedRequest('listObjectsV2', params, cb)
        }
      }

      fetchBatch(params)
    })
  },

  getSongUrl(title) {
    if (this.isPrivate()) {
      return this.client.getSignedUrl('getObject', {
        Bucket: BUCKET,
        Key: SUBPATH + title,
        Expires: 1800,
      })
    } else if (FORCE_PATH_STYLE) {
      return `https://${ENDPOINT}/${BUCKET}/${SUBPATH}${encodeURIComponent(title)}`
    } else {
      return `https://${BUCKET}.${ENDPOINT}/${SUBPATH}${encodeURIComponent(title)}`
    }
  },

  fetchLyrics(songTitle) {
    return new Promise((resolve) => {
      if (!METADATA) {
        resolve(null)
        return
      }

      this.init()
      const baseName = songTitle.replace(supportedFormatsRegexp, '')
      const key = METADATA + baseName + '.yml'

      const cb = (err, data) => {
        if (err) {
          if (err.code !== 'NoSuchKey') {
            console.log('Failed to fetch metadata', err)
          }
          resolve(null)
          return
        }

        try {
          const text = data.Body.toString('utf-8')
          const parsed = jsyaml.load(text)
          resolve(parsed?.lyrics ?? null)
        } catch (e) {
          console.log('Failed to parse metadata', e)
          resolve(null)
        }
      }

      if (this.isPrivate()) {
        this.client.getObject({ Bucket: BUCKET, Key: key }, cb)
      } else {
        this.client.makeUnauthenticatedRequest(
          'getObject',
          { Bucket: BUCKET, Key: key },
          cb,
        )
      }
    })
  },

  /**
   * Lists all .yml files in the metadata directory and returns a Set of basenames
   * (filename without the .yml extension). Returns null if METADATA is not configured.
   */
  listMetadataFiles() {
    return new Promise((resolve) => {
      if (!METADATA) {
        resolve(null)
        return
      }

      this.init()
      const basenames = new Set()
      const params = { Bucket: BUCKET, Prefix: METADATA }

      const fetchBatch = (params) => {
        const cb = (err, data) => {
          if (err) {
            console.log('Failed to list metadata files', err)
            resolve(null)
            return
          }

          ;(data.Contents || []).forEach((obj) => {
            const filename = obj.Key.slice(METADATA.length)
            if (filename.endsWith('.yml')) {
              basenames.add(filename.slice(0, -4))
            }
          })

          if (data.IsTruncated) {
            params.ContinuationToken = data.NextContinuationToken
            fetchBatch(params)
          } else {
            resolve(basenames)
          }
        }

        if (this.isPrivate()) {
          this.client.listObjectsV2(params, cb)
        } else {
          this.client.makeUnauthenticatedRequest('listObjectsV2', params, cb)
        }
      }

      fetchBatch(params)
    })
  },
}

window.AudioContext = // Automatic detection of webkit.
  window.AudioContext || window.webkitAudioContext || window.mozAudioContext

DOM.audio.volume = 1

/**
 * Rebuilds the filename→index map after any change to Player.songs order.
 */
function rebuildSongIndex() {
  Player.songIndex.clear()
  Player.songs.forEach((song, i) => Player.songIndex.set(song, i))
}

/**
 * Loads songs in their original order on startup.
 * @param {string[]} songs. Array of songs' names received from Object Storage.
 */
function loadMusic(songs) {
  DOM.audio.currentTime = 0
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'paused'
  }

  Player.songs = songs
  Player.originalSongs = songs
    .slice()
    .sort((a, b) => prepareTitle(a).localeCompare(prepareTitle(b)))
  Player.index = 0
  Player.baseIndex = 0
  rebuildSongIndex()

  showFirst()
}

/**
 * Shuffles the playlist in-place (Fisher-Yates) and jumps to a random song.
 */
function shufflePlaylist() {
  DOM.shuffleButton.classList.add('shuffle-button--active')
  let remaining = Player.songs.length,
    index,
    temp

  while (remaining > 0) {
    index = Math.floor(Math.random() * remaining)
    remaining--
    temp = Player.songs[remaining]
    Player.songs[remaining] = Player.songs[index]
    Player.songs[index] = temp
  }

  Player.index = Math.floor(Math.random() * Player.songs.length)
  Player.baseIndex = Player.index
  rebuildSongIndex()

  changeSong()
  setTimeout(
    () => DOM.shuffleButton.classList.remove('shuffle-button--active'),
    1000,
  )
}

/**
 * Loads the first element of shuffled song list to the HTML. Also turns off the overlay.
 */
function showFirst() {
  DOM.progress.value = 0

  if (
    (!navigator.mediaSession ||
      navigator.mediaSession.playbackState === 'paused') &&
    DOM.audio.src === ''
  ) {
    DOM.songName.style.display = 'inline-block'
    updateTitle()
    disableLoader()

    DOM.audio.src = songUrl(Player.songs[0])
    loadSongLyrics()
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

function showCanvas() {
  DOM.canvas.style.display = 'block'
}

function hideCanvas() {
  DOM.canvas.style.display = 'none'
}

/**
 * Updates session data on changing of song.
 * @param {string} title. Song[i].Key (title of song).
 */
function updateMetadata(fullTitle, year) {
  if ('mediaSession' in navigator) {
    const captureGroups = fullTitle.split(/\s-\s/)

    navigator.mediaSession.metadata = new MediaMetadata({
      artist: captureGroups[0],
      title: captureGroups[1],
      artwork: [
        {
          src: `data:image/webp;base64,${window.Assets.artworkBase64}`,
          sizes: '256x256',
          type: 'image/webp',
        },
      ],
      album: year, // Put year in album field cause there is no such field sadly
    })
  }
}

const unsafeChars = /[\/\\\?\%\#\:\<\>\|\"\\*]/g
const escapeRegex = /__([0-9A-Fa-f]{2})__/g

/**
 * Decodes a filename containing escaped characters like / or : back to its original form.
 * @param {string} encoded - The encoded filename.
 * @returns {string} The decoded filename.
 */
function decodeFilename(encoded) {
  return encoded.replace(escapeRegex, (_, hex) => {
    const code = parseInt(hex, 16)

    return isNaN(code) ? `__${hex}__` : String.fromCharCode(code)
  })
}

/**
 * Performs title transformations.
 * @param {string} title. Initial name of song with extensions.
 * @return {string} preparedTitle
 */
function prepareTitle(title) {
  return decodeFilename(title.replace(supportedFormatsRegexp, ''))
}

/**
 * Updates title of song on switch. Also removes extension from the title.
 */
function updateTitle() {
  const preparedTitleWithYear = prepareTitle(Player.songs[Player.index])

  const [fullTitle, possibleYear] = preparedTitleWithYear
    .split(/(\d{4})$/)
    .map((v) => (v ? v.trim() : v))

  DOM.songName.textContent = fullTitle
  document.title = fullTitle
  updateMetadata(fullTitle, possibleYear)
  updateMarquee()
}

/**
 * Recalculates marquee scroll for the current title based on available container width.
 * Safe to call after resize or any layout change.
 */
function updateMarquee() {
  DOM.songName.classList.remove('song-name--scrolling')
  DOM.songName.style.removeProperty('--marquee-offset')
  DOM.songName.style.removeProperty('--marquee-duration')

  const overflow =
    DOM.songName.scrollWidth - DOM.songName.parentElement.clientWidth

  if (overflow > 0) {
    const duration = Math.max(3, overflow / 40)
    DOM.songName.style.setProperty('--marquee-offset', `-${overflow}px`)
    DOM.songName.style.setProperty('--marquee-duration', `${duration}s`)
    DOM.songName.classList.add('song-name--scrolling')
  }
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
    return length + index
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
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'playing'
  }
}

/**
 * Pauses current song.
 */
function pauseSong() {
  DOM.audio.pause()

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'paused'
  }
}

/**
 * Updates song on changing of index.
 * @param {boolean} scrollToTop. Whether to reset the queue list scroll position.
 */
function changeSong(scrollToTop = true) {
  const wasPlaying = !DOM.audio.paused
  loadSong(Player.index)
  updateTitle()
  if (wasPlaying) {
    playCurrentSong()
  }
  loadSongLyrics()
  updateQueuePanel(scrollToTop)
}

/**
 * Sets the logic of next song button. Also changes visuals.
 */
function nextSong() {
  advanceToNext()
  changeSong(false)
}

/**
 * Sets the logic of previous song button. Also visual changes.
 */
function previousSong() {
  decrementSong()
  changeSong(false)
}

/**
 * Based on current timing of audio component fill the text area left of position element.
 */
function updateDisplayedTime() {
  if (Math.floor(DOM.audio.currentTime % 60) < 10)
    DOM.time.textContent =
      Math.floor(DOM.audio.currentTime / 60) +
      ':0' +
      Math.floor(DOM.audio.currentTime % 60)
  else
    DOM.time.textContent =
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

function saveMetadata(metadata) {
  Lyrics.metadataFiles = metadata
}

/**
 * Requests songs' data from bucket.
 */
async function requestSongs() {
  try {
    const [songs, metadataFiles] = await Promise.all([
      S3.listSongs(),
      S3.listMetadataFiles(),
    ])

    saveMetadata(metadataFiles)
    loadMusic(songs)
  } catch (err) {
    console.error('Error fetching songs from S3:', err)
  }
}

/**
 * Increment current song index.
 */
function incrementSong() {
  Player.baseIndex = normalizeSongIndex(
    Player.baseIndex + 1,
    Player.songs.length,
  )
  Player.index = Player.baseIndex
}

/**
 * Decrement current song index.
 */
function decrementSong() {
  Player.baseIndex = normalizeSongIndex(
    Player.baseIndex - 1,
    Player.songs.length,
  )
  Player.index = Player.baseIndex
}

/**
 * Adds a song to the manual play queue.
 * @param {string} songKey. Song filename / key.
 */
function addToQueue(songKey) {
  Queue.items.push(songKey)
  updateQueuePanel(false)
}

/**
 * Removes a song from the manual play queue by its queue index.
 * @param {number} qIdx. Index inside Queue.items.
 */
function removeFromQueue(qIdx) {
  Queue.items.splice(qIdx, 1)
  updateQueuePanel()
}

/**
 * Advances Player.index to the next song, consuming from Queue first.
 * Playing a queued song only moves Player.index (what's playing now) —
 * Player.baseIndex (where normal playback resumes once the queue is empty)
 * is left untouched.
 */
function advanceToNext() {
  if (Queue.items.length > 0) {
    const nextKey = Queue.items.shift()
    const idx = Player.songIndex.get(nextKey) ?? -1

    if (idx === -1) {
      incrementSong()
    } else {
      Player.index = idx
    }
  } else {
    incrementSong()
  }
}

/**
 * Switches to the next song if the previous has ended.
 */
function nextSongOnEnd() {
  advanceToNext()
  updateTitle()

  DOM.audio.src = songUrl(Player.songs[Player.index])
  DOM.audio.play()
  loadSongLyrics()
  updateQueuePanel(false)
}

/**
 * Moves slider according to current time.
 */
function moveSlider() {
  if (!Audio.isSeeking) {
    if (DOM.audio.currentTime === 0) {
      DOM.progress.value = 1
    } else {
      DOM.progress.value = (DOM.audio.currentTime * 100) / DOM.audio.duration
    }

    updateDisplayedTime()
  }
}

/**
 * Checks whether the audio is muted.
 */
function isMuted() {
  const vol = DOM.volume ? Number(DOM.volume.value) : Audio.lastVolume
  return vol < 0.0001
}

/**
 * Toggles the visualization bars on/off.
 */
function toggleBars() {
  if (Visualizer.context) {
    const stopped = !Visualizer.stopped

    Visualizer.stopped = stopped

    if (stopped) {
      Visualizer.stop()
      DOM.toggleBarsButton.classList.add('toggle-bars-button-active')

      hideCanvas()
    } else {
      Visualizer.start()
      DOM.toggleBarsButton.classList.remove('toggle-bars-button-active')

      showCanvas()
    }
  }
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

  if (!isMuted()) {
    Visualizer.start()
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
    Visualizer.start()
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
 * Shows or hides the lyrics button based on whether lyrics are available.
 */
function updateLyricsButton() {
  DOM.lyricsButton.style.display = Lyrics.current ? 'block' : 'none'
}

/**
 * Shows the lyrics panel with the current song's lyrics.
 */
function showLyricsPanel() {
  renderLyrics(Lyrics.current || '')

  DOM.lyricsPanel.style.display = 'flex'
  Lyrics.visible = true
  DOM.lyricsButton.classList.add('toggle-lyrics-button-active')

  requestAnimationFrame(() => {
    DOM.lyricsContent.scrollTop = 0
  })
}

/**
 * Hides the lyrics panel.
 */
function hideLyricsPanel() {
  DOM.lyricsPanel.style.display = 'none'
  Lyrics.visible = false
  DOM.lyricsButton.classList.remove('toggle-lyrics-button-active')
}

/**
 * Toggles the lyrics panel on/off.
 */
function toggleLyrics() {
  if (Lyrics.visible) {
    hideLyricsPanel()
  } else if (Lyrics.current) {
    hideQueuePanel()

    showLyricsPanel()
  }
}

/**
 * Loads lyrics for the current song from metadata, then updates the button visibility.
 * Uses an in-memory cache so switching back and forth never re-fetches.
 * Skips the network request entirely when we know the metadata file doesn't exist.
 */
async function loadSongLyrics() {
  Lyrics.current = null
  hideLyricsPanel()
  updateLyricsButton()

  const songTitle = Player.songs[Player.index]

  const baseName = songTitle.replace(supportedFormatsRegexp, '')
  const hasNoFile =
    Lyrics.metadataFiles !== null && !Lyrics.metadataFiles.has(baseName)

  if (Object.prototype.hasOwnProperty.call(Lyrics.cache, songTitle)) {
    Lyrics.current = Lyrics.cache[songTitle]
  } else if (hasNoFile) {
    Lyrics.cache[songTitle] = null
  } else {
    const lyrics = await S3.fetchLyrics(songTitle)
    Lyrics.cache[songTitle] = lyrics
    Lyrics.current = lyrics
  }

  updateLyricsButton()
}

/**
 *
 * @param {string} text. Song text in single string
 * Renders lyrics text by splitting it into lines and creating divs for each line.
 */
function renderLyrics(text) {
  DOM.lyricsText.textContent = ''

  const lines = (text || '').split('\n')
  const fragment = document.createDocumentFragment()

  lines.forEach((line) => {
    const el = document.createElement('div')
    el.className = 'lyric-line'
    el.textContent = line

    if (line.trim() === '') {
      el.classList.add('verse-break')
    }

    fragment.appendChild(el)
  })

  DOM.lyricsText.appendChild(fragment)
}

/**
 * Toggles the queue panel (song list + search) on/off.
 */
function toggleQueue() {
  if (Search.visible) {
    hideQueuePanel()
  } else {
    hideLyricsPanel()

    showQueuePanel()
  }
}

/**
 * Shows the queue panel with the nearby songs and search results (if any).
 */
function showQueuePanel() {
  Search.visible = true
  DOM.queuePanel.style.display = 'flex'
  DOM.queueButton.classList.add('toggle-queue-button--active')
  updateQueuePanel()

  requestAnimationFrame(() => DOM.queueSearch.focus())
}

/**
 * Hides the queue panel.
 */
function hideQueuePanel() {
  Search.visible = false
  DOM.queuePanel.style.display = 'none'
  DOM.queueButton.classList.remove('toggle-queue-button--active')
}

/**
 * Redraws the queue panel contents. No-ops when the panel is hidden.
 * @param {boolean} scrollToTop. Whether to reset the list scroll position.
 */
function updateQueuePanel(scrollToTop = true) {
  if (!Search.visible) {
    return
  }

  const query = Search.searchQuery.toLowerCase().trim()

  if (query) {
    renderSearchResults(query)
  } else {
    renderNearSongs()
  }

  if (scrollToTop) {
    DOM.queueList.scrollTop = 0
  }
}

/**
 * Creates a queue list item element.
 * @param {string} title. Display title.
 * @param {string} modifier. BEM modifier class (e.g. 'current', 'next').
 * @param {Function|null} onClick. Click handler on the row itself.
 * @returns {HTMLElement}
 */
function createQueueItemEl(title, modifier, onClick) {
  const el = document.createElement('div')
  el.className = `queue-item${modifier ? ' queue-item--' + modifier : ''}`

  const titleEl = document.createElement('span')
  titleEl.className = 'queue-item__title'
  titleEl.textContent = title
  el.appendChild(titleEl)

  if (onClick) {
    el.addEventListener('click', onClick)
  }

  return el
}

/**
 * Appends a small action button (+/×) to a queue item element.
 * @param {HTMLElement} el. The queue item.
 * @param {string} icon. Button label.
 * @param {Function} onClick. Click handler (propagation is stopped automatically).
 * @param {string|null} extraClass. Optional extra class.
 */
function appendQueueBtn(el, icon, onClick, extraClass) {
  const btn = document.createElement('button')
  btn.className = 'queue-item__btn' + (extraClass ? ' ' + extraClass : '')
  btn.textContent = icon
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  el.appendChild(btn)
}

/**
 * Renders the queue panel when search is empty.
 * Shows queued songs first, then all songs in playlist order.
 * Scrolls the current song into view.
 */
function renderNearSongs() {
  const { songs, index, baseIndex } = Player
  DOM.queueList.textContent = ''

  if (songs.length === 0) {
    return
  }

  const fragment = document.createDocumentFragment()
  const queuedKeys = new Set(Queue.items)

  const addSongEl = (key, idx) => {
    const isCurrent = idx === index
    const el = createQueueItemEl(
      prepareTitle(key),
      isCurrent ? 'current' : null,
      isCurrent
        ? null
        : () => {
            Player.index = idx
            Player.baseIndex = idx
            changeSong()
          },
    )
    if (!isCurrent) {
      appendQueueBtn(el, '+', () => addToQueue(key))
    }

    fragment.appendChild(el)
  }

  // Current song
  addSongEl(songs[index], index)

  // Queued songs (play next, in order)
  Queue.items.forEach((songKey, qIdx) => {
    const el = createQueueItemEl(prepareTitle(songKey), 'next', () => {
      const idx = Player.songIndex.get(songKey) ?? -1
      if (idx !== -1) {
        Queue.items.splice(qIdx, 1)
        Player.index = idx
        changeSong()
      }
    })
    appendQueueBtn(
      el,
      '×',
      () => removeFromQueue(qIdx),
      'queue-item__btn--remove',
    )
    fragment.appendChild(el)
  })

  // Songs after the playlist bookmark, then wrap around to songs before it.
  // Uses baseIndex (not index) so the preview reflects where playback
  // resumes once the manual queue is drained, even while a queued song is
  // currently playing.
  for (let offset = 1; offset < songs.length; offset++) {
    const i = (baseIndex + offset) % songs.length

    if (i !== index && !queuedKeys.has(songs[i])) {
      addSongEl(songs[i], i)
    }
  }

  DOM.queueList.appendChild(fragment)
}

/**
 * Renders search results filtered by query string.
 * @param {string} query. Lowercase trimmed search string.
 */
function renderSearchResults(query) {
  DOM.queueList.textContent = ''

  const currentSong = Player.songs[Player.index]
  const matches = Player.originalSongs
    .filter(
      (song) =>
        song !== currentSong &&
        prepareTitle(song).toLowerCase().includes(query),
    )
    .slice(0, 30)

  if (prepareTitle(currentSong).toLowerCase().includes(query)) {
    matches.unshift(currentSong)
  }

  if (matches.length === 0) {
    const el = document.createElement('div')
    el.className = 'queue-empty'
    el.textContent = 'No songs found'
    DOM.queueList.appendChild(el)
  } else {
    const fragment = document.createDocumentFragment()

    matches.forEach((song) => {
      const idx = Player.songIndex.get(song) ?? -1
      const isCurrent = idx === Player.index
      const el = createQueueItemEl(
        prepareTitle(song),
        isCurrent ? 'current' : null,
        !isCurrent && idx !== -1
          ? () => {
              Player.index = idx
              Player.baseIndex = idx
              Search.searchQuery = ''
              DOM.queueSearch.value = ''
              changeSong()
            }
          : null,
      )

      if (!isCurrent) {
        const qIdx = Queue.items.indexOf(song)

        if (qIdx === -1) {
          appendQueueBtn(el, '+', () => addToQueue(song))
        } else {
          appendQueueBtn(
            el,
            '×',
            () => removeFromQueue(qIdx),
            'queue-item__btn--remove',
          )
        }
      }

      fragment.appendChild(el)
    })

    DOM.queueList.appendChild(fragment)
  }
}

/**
 * Adds all necessary event listeners.
 */
function addListeners() {
  let resizeTimeout
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout)

    resizeTimeout = setTimeout(() => {
      Visualizer.updateCanvasParameters()
      updateMarquee()
    }, 25)
  })

  DOM.audio.addEventListener('ended', nextSongOnEnd)
  DOM.audio.addEventListener('timeupdate', moveSlider)
  DOM.audio.addEventListener('play', () => {
    Visualizer.start()

    updatePlayIcon()
  })

  DOM.audio.addEventListener('pause', () => {
    updatePlayIcon()
  })

  DOM.audio.addEventListener('seeked', async () => {
    // Safari can auto-suspend the AudioContext during a seek; resume it if needed.
    if (Audio.context?.state === 'suspended') {
      try {
        await Audio.context.resume()
      } catch (err) {
        console.warn('AudioContext resume failed after seek', err)
      }
    }

    Visualizer.start()
  })

  DOM.progress.addEventListener('pointerdown', () => {
    Audio.isSeeking = true
    Audio.wasPlayingBeforeSeek = !DOM.audio.paused

    if (Audio.wasPlayingBeforeSeek) {
      DOM.audio.pause()
    }
  })

  DOM.progress.addEventListener('pointerup', () => {
    Audio.isSeeking = false

    if (Audio.wasPlayingBeforeSeek) {
      Audio.wasPlayingBeforeSeek = false
      playCurrentSong()
    }
  })

  DOM.progress.addEventListener('input', () => {
    if (!DOM.audio.duration || isNaN(DOM.audio.duration)) {
      Audio.pendingSeek = DOM.progress.value
      return
    } else {
      DOM.audio.currentTime = (DOM.audio.duration / 100) * DOM.progress.value
      updateDisplayedTime()
    }
  })

  DOM.audio.addEventListener('loadedmetadata', () => {
    if (Audio.pendingSeek !== null) {
      DOM.audio.currentTime = (DOM.audio.duration / 100) * Audio.pendingSeek

      Audio.pendingSeek = null
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (Lyrics.visible) {
        hideLyricsPanel()
      }

      if (Search.visible) {
        hideQueuePanel()
      }
    }
  })

  DOM.queueSearch.addEventListener('input', (e) => {
    Search.searchQuery = e.target.value
    updateQueuePanel()
  })

  DOM.volumeButton.addEventListener('click', toggleMute)
  DOM.volume.addEventListener('input', changeVolume)

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('previoustrack', previousSong)
    navigator.mediaSession.setActionHandler('nexttrack', nextSong)
    navigator.mediaSession.setActionHandler('pause', toggleMusic)
    navigator.mediaSession.setActionHandler('play', toggleMusic)
  }
}

/**
 * The boot and the listeners' logic.
 */
// Prevent pinch-zoom on browsers that ignore user-scalable=no and touch-action (e.g. Samsung Internet)
document.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false },
)
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false },
)

window.addEventListener('load', () => {
  initLoader()
  S3.init()
  requestSongs()
  addListeners()
  document.fonts.ready.then(() => updateMarquee())
})
