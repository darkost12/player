/**
 * Gets songs from S3 Object Storage through REST API and puts in the custom WEB-player.
 */
const OVERLAY = document.getElementsByClassName('overlay')[0]                                     //Shadowed loading overlay
const SONG_NAME = document.getElementsByClassName('song-name')[0]                                 //The link to the <h> element.
const PLAYER = document.getElementsByClassName('music-player')[0]                                 //The link to the <audio> element in HTML code.
const TIMING = document.getElementsByClassName('current-time')[0]                                 //The link to the <div> element.
const SPINNER = document.getElementsByClassName('load-spinner')[0]                                //Spinner on loading overlay
const TOGGLE_BUTTON = document.getElementsByClassName('toggle-button')[0]                         //The link to the <img> element.
const VOLUME_BUTTON = document.getElementsByClassName('volume-button')[0]                         //The link to the <img> element.
const POSITION = document.getElementsByClassName('current-position')[0]                           //The link to the <input type="range"> element.
const VOLUME_POSITION = document.getElementsByClassName('volume-regulator')[0]                    //The link to the <input type="range"> element.
const SPECTRUM_SMOOTHING_CONSTANT = 0.75                                                          //The constant determines how smooth the spectrum's change will be. Optimal range: 0.7-0.9
const STOP_RENDER_DELAY = 0.5                                                                     //The time in seconds after which the rendering stops on pause or mute.
let s3 = undefined
let songList = []                                                                                 //The information after the shuffle process. Ready to be put in the actual play.
let currentSong                                                                                   //The global identificator of currently playing song
let audioContext, visualContext, audioSrc, analyser                                               //Variables for audioContext analysis.
let canvas, canvasOptions, dpr, capHeight                                                         //Canvas and bars variables.
let lastVolume = 0.5                                                                              //Last non-zero volume of audio.
let stopTimestamp = null                                                                          //Stop or mute time.

const titleReplaces = [                                                                           //List of title transitions.
  { from: '.mp3', to: '' },
  { from: 'AC_DC', to: 'AC/DC' }
]

const subpath = 'music/'

window.AudioContext =                                                                             //Automatic detection of webkit.
  window.AudioContext || window.webkitAudioContext || window.mozAudioContext

/**
 * Shuffles music after getting through API call.
 * @param {string[]} songs. Array of songs' names received from Object Storage.
 */
function shuffleMusic(songs) {
  PLAYER.currentTime = 0
  navigator.mediaSession.playbackState = 'paused'
  songList = songs

  let ctr = songs.length,                                                                         //Fisher-Yates shuffle algorithm
    index,
    temp

  while (ctr > 0) {
    index = Math.floor(Math.random() * ctr)
    ctr--
    temp = songList[ctr]
    songList[ctr] = songList[index]
    songList[index] = temp
  }

  currentSong = 0

  showFirst()
}

/**
 * Loads the first element of shuffled song list to the HTML. Also turns off the overlay.
 */
function showFirst() {
  POSITION.value = 1

  if (navigator.mediaSession.playbackState === 'paused' && PLAYER.src == '') {
    updateTitle()
    disableLoader()

    PLAYER.src = link(songList[0])
    SONG_NAME.style.display = 'inline-block'
  }
}

/**
 * Shows loader spinner at the very beginning.
 */
function initLoader() {
  OVERLAY.style.display = 'block'
  SPINNER.style.display = 'block'
}

/**
 * Disables shadowing of background and loader spinner.
 */
function disableLoader() {
  OVERLAY.style.display = 'none'
  SPINNER.style.display = 'none'
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
          src: 'https://wallpapersmug.com/download/320x240/a7e9e6/nebula-space-planet-blue-art-4k.jpg',
          sizes: '320x240',
          type: 'image/png'
        }, {
          src: 'https://i1.wp.com/edgeeffects.net/wp-content/uploads/2021/03/The_Earth_seen_from_Apollo_17.jpg?ssl=1',
          sizes: '512x512',
          type: 'image/png'
        }
      ],
      album: year                                                                                  //Put year in album field cause there is no such field sadly
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
  const preparedTitleWithYear = prepareTitle(songList[currentSong])

  const [fullTitle, possibleYear] = preparedTitleWithYear.split(/(\d{4})$/).map(v => v ? v.trim() : v)

  SONG_NAME.innerHTML = fullTitle
  updateMetadata(fullTitle, possibleYear)
}

/**
 * Handles song index when switching from last song in list to the first and vice versa.
 */
function firstAndLast() {
  if (currentSong > (songList.length - 1)) {
    currentSong = 0
  } else if (currentSong < 0) {
    currentSong = songList.length - 1
  }
}

/**
 * Sets the logic of toggle button. Also opens/closes contexts.
 */
function toggleMusic() {
  if (PLAYER.src != '' && PLAYER.paused) {
    PLAYER.play()
    openContext()

    navigator.mediaSession.playbackState = 'playing'
  } else if (PLAYER.src != '' && !PLAYER.paused) {
    PLAYER.pause()

    navigator.mediaSession.playbackState = 'paused'
  }
}

/**
 * Updates song on changing of index.
 */
function changeSong() {
  navigator.mediaSession.playbackState = 'paused'
  PLAYER.src = link(songList[currentSong])

  PLAYER.oncanplay = () => {
    PLAYER.play()
    openContext()
    navigator.mediaSession.playbackState = 'playing'
    updateTitle()
  }
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
  if (Math.floor(PLAYER.currentTime % 60) < 10)
    TIMING.innerHTML = Math.floor(PLAYER.currentTime / 60) + ':0' + Math.floor(PLAYER.currentTime % 60)
  else
    TIMING.innerHTML = Math.floor(PLAYER.currentTime / 60) + ':' + Math.floor(PLAYER.currentTime % 60)
}

/**
 * Gets pixel ratio of current device for correct drawing on canvas with high sharpness.
 * @param {canvas object} canvas.
 * @return {canvas_context} ctx.
 */
function setupVisualContext() {
  canvas = canvas || document.getElementsByClassName('canvas')[0]
  dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  visualContext = ctx
}

/**
 * Called if window was resized to tweak the params to get rid of possible blurriness.
 */
function updateCanvasParameters() {
  setupVisualContext()
  initializeOptions()
}

/**
 * Opens new context for current song.
 */
function openContext() {
  if (!audioContext) {
    audioContext = new AudioContext()

    if (!audioSrc)
      audioSrc = audioContext.createMediaElementSource(PLAYER)

    analyser = audioContext.createAnalyser()
    audioSrc.connect(analyser)
    analyser.connect(audioContext.destination)
    analyser.smoothingTimeConstant = SPECTRUM_SMOOTHING_CONSTANT
    analyser.fftSize = 512

    if (!visualContext) {
      setupVisualContext()
    }
  }

  renderFrame()
}

/**
 * Initialize canvas options.
 */
function initializeOptions() {
  const innerHeight = canvas.height / dpr
  const innerWidth = canvas.width / dpr
  const capHeight = 2
  const barWidth = 13
  const barSpacing = 25
  const barHeight = innerHeight - capHeight
  const nOfBars = Math.round(innerWidth / barSpacing)
  const styles = {
    capStyle: '#fff',
    gradient: (() => {
      const g = visualContext.createLinearGradient(0, barHeight, 0, 0)

      g.addColorStop(1, '#0f3443')
      g.addColorStop(0.5, '#34e89e')
      g.addColorStop(0, 'hsl( 120, 100%, 50% )')
      return g
    })()
  }

  const frequencyUpper = audioContext.sampleRate / 2
  const frequencyLimit = Math.min(16e3, frequencyUpper)

  canvasOptions = {
    innerHeight: innerHeight,
    innerWidth: innerWidth,
    capHeight: capHeight,
    barWidth: barWidth,
    barHeight: barHeight,
    barSpacing: barSpacing,
    nOfBars: nOfBars,
    styles: styles,
    frequencyUpper: frequencyUpper,
    frequencyLimit: frequencyLimit
  }
}

/**
 * Draws new frame of spectrum visualization.
 */
function renderFrame() {
  function clearCanvas() {
    ctx.clearRect(0, 0, opts.innerWidth, opts.innerHeight)

    for (let i = 0; i < opts.nOfBars; i++) {
      const xPosition = opts.barSpacing * (i + 0.5)

      if ((xPosition + opts.barWidth) < opts.innerWidth) {
        ctx.fillStyle = opts.styles.capStyle

        ctx.fillRect(
          xPosition,
          opts.barHeight,
          opts.barWidth,
          opts.capHeight
        )
      }
    }
  }

  if (canvasOptions === undefined)
    initializeOptions()

  const ctx = visualContext
  const opts = canvasOptions

  ctx.clearRect(0, 0, opts.innerWidth, opts.innerHeight)

  const frequencyData = new Uint8Array(analyser.frequencyBinCount)

  const step =
    (frequencyData.length * (opts.frequencyLimit / opts.frequencyUpper) - 1)
    / (opts.nOfBars - 1)

  analyser.getByteFrequencyData(frequencyData)

  for (let i = 0; i < opts.nOfBars; i++) {
    const value = frequencyData[Math.floor(i * step)] / 255
    const xPosition = opts.barSpacing * (i + 0.5)

    if ((xPosition + opts.barWidth) < opts.innerWidth) {
      ctx.fillStyle = opts.styles.gradient

      ctx.fillRect(
        xPosition,
        opts.barHeight * (1 - value) + opts.capHeight,
        opts.barWidth,
        opts.barHeight * value
      )

      ctx.fillStyle = opts.styles.capStyle

      ctx.fillRect(
        xPosition,
        opts.barHeight * (1 - value),
        opts.barWidth,
        opts.capHeight
      )
    }
  }

  if (!PLAYER.paused && !PLAYER.muted && stopTimestamp !== null) {
    requestAnimationFrame(renderFrame)
  } else if (!PLAYER.paused && !PLAYER.muted || Date.now() - stopTimestamp < STOP_RENDER_DELAY * 1000) {
    requestAnimationFrame(renderFrame)
  } else {
    clearCanvas()
  }
}

/**
 * @returns {bool}. Whether bucket public or private
 */
function isBucketPrivate() {
  return (ACCESS_KEY && SECRET_KEY)
}

/**
 * Gets signed or direct link via GET request using 'Key' parameter.
 * @param {string} title. Song[i].Key (title of song).
 * @return {string} url. Signed url for audio.src.
 */
function link(title) {
  if (isBucketPrivate()) {
    const url = s3.getSignedUrl('getObject', {
      Bucket: BUCKET,
      Key: subpath + title,
      Expires: 1800
    })

    return url
  } else {
    return 'https://' + BUCKET + `.${ENDPOINT}/` + subpath + title
  }
}

/**
 * Requests songs' data from bucket.
 */
function requestSongs() {
  s3 = new AWS.S3({
    endpoint: 'https://' + ENDPOINT,
  })

  let receivedSongs = []

  const subpathRegexp = new RegExp(subpath, 'g')

  const [params, callback] =
    [
      { Bucket: BUCKET },
      (err, data) => {
        if (err)
          console.log(err, err.stack)
        else {
          data.Contents.forEach(song => receivedSongs.push(song.Key.replace(subpathRegexp, '')))

          shuffleMusic(receivedSongs.filter(k => k.includes('.mp3')))
        }
      }
    ]

  if (isBucketPrivate()) {
    s3.listObjects(params, callback)
  } else {
    s3.makeUnauthenticatedRequest('listObjects', params, callback)
  }
}
/**
 * Increment current song index.
 */
function incrementSong() {
  currentSong += 1
  firstAndLast()
}

/**
 * Decrement current song index.
 */
function decrementSong() {
  currentSong -= 1
  firstAndLast()
}

/**
 * Switches to the next song if the previous has ended.
 */
function nextSongOnEnd() {
  incrementSong()
  updateTitle()

  PLAYER.src = link(songList[currentSong])
  PLAYER.play()
}

/**
 * Updates displayed current time.
 */
function changeTime() {
  PLAYER.currentTime = PLAYER.duration / 100 * POSITION.value
}

/**
 * Moves slider according to current time.
 */
function moveSlider() {
  if (PLAYER.currentTime == 0) {
    POSITION.value = 1
  } else {
    POSITION.value = (PLAYER.currentTime * 100 / PLAYER.duration)
  }

  updateDisplayedTime()
}

/**
 * Toggles the mute icon according to the volume.
 * @param volume {number}. Current player's volume.
 */
function updateMuteButtonIcon(volume) {
  VOLUME_BUTTON.src = (volume == 0) ? 'res/mute.png' : 'res/volume.png'
}

/**
 * Changes the volume according to the slider position.
 */
function changeVolume() {
  PLAYER.volume = VOLUME_POSITION.value
  openContext()
}

/**
 * Toggles mute on click.
 */
function toggleMute() {
  if (!PLAYER.muted) {
    lastVolume = PLAYER.volume
    PLAYER.muted = true
    VOLUME_POSITION.value = 0
  } else {
    PLAYER.muted = false
    PLAYER.volume = lastVolume
    VOLUME_POSITION.value = lastVolume
  }

  openContext()
}

/**
 * Updates play/pause icon based on slider value.
 */
function updatePlayIcon() {
  TOGGLE_BUTTON.src = PLAYER.paused ? 'res/play.png' : 'res/pause.png'
}

/**
 * The boot and the listeners' logic.
 */
window.onload = function () {
  initLoader()

  AWS.config.update({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY
  })

  requestSongs()
  PLAYER.volume = lastVolume

  window.addEventListener('resize', updateCanvasParameters)

  PLAYER.addEventListener('ended', nextSongOnEnd)
  PLAYER.addEventListener('timeupdate', moveSlider)
  PLAYER.addEventListener('play', () => {
    stopTimestamp = null

    updatePlayIcon()
  })

  PLAYER.addEventListener('pause', () => {
    stopTimestamp = Date.now()

    updatePlayIcon()
  })

  POSITION.addEventListener('input', changeTime)
  VOLUME_BUTTON.addEventListener('click', toggleMute)
  VOLUME_POSITION.addEventListener('input', changeVolume)

  PLAYER.addEventListener('volumechange', () => {
    updateMuteButtonIcon(VOLUME_POSITION.value)

    if (VOLUME_POSITION.value == 0) {
      PLAYER.muted = true
    } else {
      PLAYER.muted = false
    }

    stopTimestamp = PLAYER.muted || PLAYER.volume === 0 ? Date.now() : null
  })

  navigator.mediaSession.setActionHandler('previoustrack', previousSong)
  navigator.mediaSession.setActionHandler('nexttrack', nextSong)
  navigator.mediaSession.setActionHandler('pause', toggleMusic)
  navigator.mediaSession.setActionHandler('play', toggleMusic)
}
