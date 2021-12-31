/**
 * Gets songs from AWS S3 through REST API and puts in the custom WEB-player.
 */
const overlay = document.getElementsByClassName('overlay')[0]                                     //Shadowed loading overlay
const songName = document.getElementsByClassName('song-name')[0]                                  //The link to the <h>/<h> element.
const player = document.getElementsByClassName('music-player')[0]                                 //The link to the <audio> element in HTML code.
const timing = document.getElementsByClassName('current-time')[0]                                 //The link to the <div> element.
const spinner = document.getElementsByClassName('load-spinner')[0]                                //Spinner on loading overlay
const toggleBut = document.getElementsByClassName('toggle-button')[0]                             //The link to the <img> element.
const volumeBut = document.getElementsByClassName('volume-button')[0]                             //The link to the <img> element.
const position = document.getElementsByClassName('current-position')[0]                           //The link to the <input type="range"> element.
const volumePosition = document.getElementsByClassName('volume-regulator')[0]                     //The link to the <input type="range"> element.
let s3 = undefined
let songList = []                                                                                 //The information after the shuffle process. Ready to be put in the actual play.
let currentSong                                                                                   //The global identificator of currently playing song
let audioContext, visualContext, audioSrc, analyser                                               //Variables for audioContext analysis.
let canvas, canvasOptions, dpr, capHeight                                                         //Canvas and bars variables.
let mutedAt                                                                                       //Volume on which the mute was toggled.

const titleReplaces = [                                                                           //List of title transitions.
  { from: '.mp3', to: '' },
  { from: 'AC_DC', to: 'AC/DC' }
]

window.AudioContext =                                                                             //Automatic detection of webkit.
  window.AudioContext || window.webkitAudioContext || window.mozAudioContext

/**
 * Shuffles music after getting through API call.
 * @param {string[]} songs. Array of songs' names received from AWS.
 */
function shuffleMusic(songs) {
  player.currentTime = 0
  navigator.mediaSession.playbackState = 'paused'
  toggleBut.src = 'res/play.png'
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
  position.value = 1

  if (navigator.mediaSession.playbackState === 'paused' && player.src == '') {
    updateTitle()
    disableLoader()

    player.src = link(songList[0])
    songName.style.display = 'inline-block'
  }
}

/**
 * Shows loader spinner at the very beginning.
 */
function initLoader() {
  overlay.style.display = 'block'
  spinner.style.display = 'block'
}

/**
 * Disables shadowing of background and loader spinner.
 */
function disableLoader() {
  overlay.style.display = 'none'
  spinner.style.display = 'none'
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

  songName.innerHTML = fullTitle
  updateMetadata(fullTitle, possibleYear)
}

/**
 * Handles song index when switching from last song in list to the first.
 */
function firstFromLast() {
  if (currentSong > (songList.length - 1))
    currentSong = 0
}

/**
 * Handles song index when switching from the first in list to last.
 */
function lastFromFirst() {
  if (currentSong < 0)
    currentSong = songList.length - 1
}

/**
 * Sets the logic of toggle button. Also opens/closes contexts.
 */
function toggleMusic() {
  if (player.src != '' && player.paused) {
    player.play()
    openContext()

    navigator.mediaSession.playbackState = 'playing'
    toggleBut.src = 'res/pause.png'
  } else if (player.src != '' && !player.paused) {
    player.pause()

    navigator.mediaSession.playbackState = 'paused'
    toggleBut.src = 'res/play.png'
  }
}

/**
 * Updates song on changing of index.
 */
function changeSong() {
  player.src = link(songList[currentSong])
  player.oncanplay = () => {
    openContext()
    navigator.mediaSession.playbackState = 'paused'
    toggleMusic()
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
  if (Math.floor(player.currentTime % 60) < 10)
    timing.innerHTML = Math.floor(player.currentTime / 60) + ':0' + Math.floor(player.currentTime % 60)
  else
    timing.innerHTML = Math.floor(player.currentTime / 60) + ':' + Math.floor(player.currentTime % 60)
}

/**
 * Gets pixel ratio of current device for correct drawing on canvas with high sharpness.
 * @param {canvas object} canvas.
 * @return {canvas_context} ctx.
 */
function setupVisualContext(canvas) {
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
  setupVisualContext(canvas)
  initializeOptions()
}

/**
 * Opens new context for current song.
 */
function openContext() {
  if (!audioContext) {
    audioContext = new AudioContext()

    if (!audioSrc)
      audioSrc = audioContext.createMediaElementSource(player)

    analyser = audioContext.createAnalyser()
    audioSrc.connect(analyser)
    analyser.connect(audioContext.destination)
    analyser.smoothingTimeConstant = 0.7
    analyser.fftSize = 512

    if (!visualContext) {
      canvas = document.getElementsByClassName('canvas')[0]
      setupVisualContext(canvas)
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

  if (!player.paused && !player.muted) {
    requestAnimationFrame(renderFrame)
  } else {
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
}

/**
 * @returns {bool}. Whether bucket public or private
 */
function isBucketPrivate() {
  return (accessKey && secretKey)
}

/**
 * Performs request of songs from bucket if it's open.
 */
async function requestSongsFromPublic() {
  return await fetch('https://' + bucket + '.s3.amazonaws.com/')
}

/**
 * Gets signed or direct link via GET request using 'Key' parameter.
 * @param {string} title. Song[i].Key (title of song).
 * @return {string} url. Signed url for audio.src.
 */
function link(title) {
  if (isBucketPrivate()) {
    const url = s3.getSignedUrl('getObject', {
      Bucket: bucket,
      Key: title,
      Expires: 1800
    })

    return url
  } else {
    return 'https://' + bucket + '.s3.amazonaws.com/' + title
  }
}


/**
 * Simple fetches songs' data if bucket is public.
 */
async function loadSongsFromPublic() {
  const response = await (await requestSongsFromPublic()).text()
  const xml = new window.DOMParser().parseFromString(response, 'text/xml')

  const songs =
    Array.from(xml.querySelectorAll('Contents'))
      .map(entry => entry.textContent)
      .map(info => info.split('.mp3')[0] + '.mp3')

  shuffleMusic(songs)
}

/**
 * Based on response from S3 performs parsing and serialization of songs' data if bucket is private.
 */
function loadSongsFromPrivate() {
  s3 = new AWS.S3()

  let receivedSongs = []

  s3.listObjects({ Bucket: bucket }, function (err, data) {
    if (err)
      console.log(err, err.stack);
    else {
      data.Contents.forEach(song => receivedSongs.push(song.Key))

      shuffleMusic(receivedSongs);
    }
  })
}
/**
 * Increment current song index.
 */
function incrementSong() {
  currentSong += 1
  firstFromLast()
}

/**
 * Decrement current song index.
 */
function decrementSong() {
  currentSong -= 1
  lastFromFirst()
}

/**
 * Switches to the next song if the previous has ended.
 */
function nextSongOnEnd() {
  incrementSong()
  updateTitle()

  player.src = link(songList[currentSong])
  player.play()
}

/**
 * Updates displayed current time.
 */
function changeTime() {
  player.currentTime = player.duration / 100 * position.value

  updateDisplayedTime()
}

/**
 * Moves slider according to current time.
 */
function moveSlider() {
  if (player.currentTime == 0)
    position.value = 1
  else
    position.value = (player.currentTime * 100 / player.duration)

  updateDisplayedTime()
}

/**
 * Changes the volume according to the slider position.
 */
function changeVolume() {
  const volume = volumePosition.value

  player.volume = volume

  updateVolumeIcon()
}

/**
 * Toggles mute on click.
 */
function toggleMute() {
  if (!player.muted) {
    mutedAt = player.volume
    player.muted = true
    volumePosition.value = 0
    updateVolumeIcon()
  } else {
    player.muted = false
    player.volume = mutedAt
    volumePosition.value = mutedAt
    updateVolumeIcon()
    openContext()
  }
}

/**
 * Updates volume icon based on slider value.
 */
function updateVolumeIcon() {
  if (volumePosition.value == 0) {
    volumeBut.src = 'res/mute.png'
  } else {
    volumeBut.src = 'res/volume.png'
  }
}

/**
 * The boot and the listeners' logic.
 */
window.onload = function () {
  initLoader()

  if (isBucketPrivate()) {
    AWS.config.update({
      accessKeyId: accessKey,
      secretAccessKey: secretKey
    })

    loadSongsFromPrivate()
  } else {
    loadSongsFromPublic()
  }

  player.addEventListener('ended', nextSongOnEnd)
  position.addEventListener('input', changeTime)
  player.addEventListener('timeupdate', moveSlider)
  volumeBut.addEventListener('click', toggleMute)
  volumePosition.addEventListener('input', changeVolume)
  window.addEventListener('resize', updateCanvasParameters)

  navigator.mediaSession.setActionHandler('previoustrack', () => previousSong())

  navigator.mediaSession.setActionHandler('nexttrack', () => nextSong())

  navigator.mediaSession.setActionHandler('pause', () => {
    toggleMusic()
    navigator.mediaSession.playbackState = 'paused'
  })

  navigator.mediaSession.setActionHandler('play', () => {
    toggleMusic()
    navigator.mediaSession.playbackState = 'playing'
  })
}
