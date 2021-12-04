/**
 * Gets songs from AWS S3 through REST API and puts in the custom WEB-player.
 */
const bucket = 'https://public-music-storage.s3.amazonaws.com/'                                   //AWS S3 bucket, that contains music.
let songList = []                                                                                 //The information after the shuffle process. Ready to be put in the actual play.
let currentSong                                                                                   //The global identificator of currently playing song
let player = document.getElementsByClassName('music-player')[0]                                   //The link to the <audio> element in HTML code.
let timing = document.getElementsByClassName('current-time')[0]                                   //The link to the <div> element.
let songName = document.getElementsByClassName('song-name')[0]                                    //The link to the <p>/<h> element.
let position = document.getElementsByClassName('current-position')[0]                             //The link to the <input type="range"> element.
let toggleBut = document.getElementsByClassName('toggle-button')[0]                               //The link to the <img> element.
let volumeBut = document.getElementsByClassName('volume-button')[0]                               //The link to the <img> element.
let overlay = document.getElementsByClassName('overlay')[0]                                       //Shadowed loading overlay
let spinner = document.getElementsByClassName('load-spinner')[0]                                  //Spinner on loading overlay
let audioContext, visualctx, audioSrc, analyser                                                   //Variables for audioContext analysis.
let canvas, dpr, capHeight                                                                        //Canvas and bars letiables.

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
  toggleBut.src = "res/play.png"
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
  position.value = 1;
  if (navigator.mediaSession.playbackState === 'paused' && player.src == '') {
    player.src = link(songList[0]);
    updateTitle();
    disableLoader();
    songName.style.display = 'inline-block';
  }
}

/**
 * Shows loader spinner at the very beginning.
 */
function initLoader() {
  overlay.style.display = "block"
  spinner.style.display = "block"
}

/**
 * Disables shadowing of background and loader spinner.
 */
function disableLoader() {
  overlay.style.display = "none"
  spinner.style.display = "none"
}

/**
 *
 * @param {string} title. Song[i].Key (title of song).
 */
let updateMetadata = title => {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artwork: [
        { src: 'https://wallpapersmug.com/download/320x240/a7e9e6/nebula-space-planet-blue-art-4k.jpg', sizes: '320x240', type: 'image/png' },
      ]
    });
  };
};

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
  let title = prepareTitle(songList[currentSong])

  songName.innerHTML = title;
  updateMetadata(title);
}

/**
 * Handles song index when switching from last song in list to the first.
 */
function firstFromLast() {
  if (currentSong > (songList.length - 1))
    currentSong = 0;
}

/**
 * Handles song index when switching from the first in list to last.
 */
function lastFromFirst() {
  if (currentSong < 0)
    currentSong = songList.length - 1;
}

/**
 * Sets the logic of toggle button. Also opens/closes contexts.
 */
function toggleMusic() {
  if (player.src != '' && player.paused) {
    openContext();
    player.play();
    navigator.mediaSession.playbackState = 'playing';
    toggleBut.src = "res/pause.png";
  } else if (player.src != '' && !player.paused) {
    player.pause();
    navigator.mediaSession.playbackState = 'paused';
    toggleBut.src = "res/play.png"
  }
}


/**
 * Sets the logic of next song button. Also changes visuals.
 */
function nextSong() {
  currentSong += 1;
  firstFromLast();
  player.src = link(songList[currentSong]);
  openContext();
  navigator.mediaSession.playbackState = 'paused';
  toggleMusic();
  updateTitle();
}

/**
 * Sets the logic of previous song button. Also visual changes.
 */
function previousSong() {
  currentSong -= 1;
  lastFromFirst();
  player.src = link(songList[currentSong]);
  openContext();
  navigator.mediaSession.playbackState = 'paused';
  toggleMusic();
  updateTitle();
}

/**
 * Gets signed link via GET request using "Key" parameter.
 * @param {string} title. Song[i].Key (title of song).
 * @return {string} url. Signed url for audio.src.
 */
function link(title) {
  return "https://public-music-storage.s3.amazonaws.com/" + title;
}

/**
 * Based on current timing of audio component fill the text area left of position element.
 */
function updateDisplayedTime() {
  if (Math.floor(player.currentTime % 60) < 10)
    timing.innerHTML = Math.floor(player.currentTime / 60) + ':0' + Math.floor(player.currentTime % 60);
  else
    timing.innerHTML = Math.floor(player.currentTime / 60) + ':' + Math.floor(player.currentTime % 60);
}

/**
 * Gets pixel ratio of current device for correct drawing on canvas with high sharpness.
 * @param {canvas object} canvas.
 * @return {canvas_context} ctx.
 */
function setupCanvas(canvas) {
  dpr = window.devicePixelRatio || 1;
  let rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  let ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

/**
 * Opens new context for current song.
 */
function openContext() {
  if (!audioContext) {
    audioContext = new AudioContext();

    if (!audioSrc)
      audioSrc = audioContext.createMediaElementSource(player);

    analyser = audioContext.createAnalyser();
    audioSrc.connect(analyser);
    analyser.connect(audioContext.destination);
    analyser.smoothingTimeConstant = 0.7;
    analyser.fftSize = 512;

    if (!visualctx) {
      canvas = document.getElementsByClassName('canvas')[0];
      visualctx = setupCanvas(canvas);
    }

    renderFrame();
  }
}

/**
 * Draws new frame of spectrum visualization.
 */
function renderFrame() {
  const ctx = visualctx;

  let innerHeight = canvas.height / dpr
  let innerWidth = canvas.width / dpr

  ctx.clearRect(0, 0, innerWidth, innerHeight);

  const capHeight = 2;
  const barSpacing = 25;
  const barWidth = 13;
  const barHeight = innerHeight - capHeight;
  const nOfBars = Math.round(innerWidth / barSpacing);

  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(frequencyData);

  const styles = {
    capStyle: '#fff',
    gradient: (() => {
      let g = ctx.createLinearGradient(0, barHeight, 0, 0);
      g.addColorStop(1, '#0f3443');
      g.addColorStop(0.5, '#34e89e');
      g.addColorStop(0, 'hsl( 120, 100%, 50% )');
      return g;
    })()
  };

  const frequencyUpper = audioContext.sampleRate / 2;
  const frequencyLimit = Math.min(16e3, frequencyUpper);

  const step =
    (frequencyData.length * (frequencyLimit / frequencyUpper) - 1)
    / (nOfBars - 1);

  for (let i = 0; i < nOfBars; i++) {
    const value = frequencyData[Math.floor(i * step)] / 255;
    const xPosition = barSpacing * (i + 0.5);

    if ((xPosition + barWidth) < innerWidth) {
      ctx.fillStyle = styles.gradient;
      ctx.fillRect(
        xPosition,
        barHeight * (1 - value) + capHeight,
        barWidth,
        barHeight * value
      );

      ctx.fillStyle = styles.capStyle;
      ctx.fillRect(
        xPosition,
        barHeight * (1 - value),
        barWidth,
        capHeight
      );
    }
  }

  requestAnimationFrame(renderFrame)
}

/**
 * Performs request of songs from bucket.
 */
async function requestSongs() {
  return await fetch(bucket)
}

/**
 * Based on response from S3 performs parsing and serialization of songs' data.
 */
async function loadSongs() {
  let response = await (await requestSongs()).text()
  let xml = new window.DOMParser().parseFromString(response, 'text/xml')

  let songs =
    Array.from(xml.querySelectorAll('Contents'))
      .map(entry => entry.textContent)
      .map(info => info.split('.mp3')[0] + '.mp3')

  shuffleMusic(songs)
}

/**
 * Switches to the next song if the previous has ended.
 */
function nextSongOnEnd() {
  currentSong += 1
  firstFromLast()
  updateTitle()
  player.src = link(songList[currentSong])
  player.play()
}

/**
 * Updates displayed current time.
 */
function changeTime() {
  player.currentTime = player.duration / 100 * position.value;

  updateDisplayedTime();
};

/**
 * Moves slider according to current time.
 */
function moveSlider() {
  if (player.currentTime == 0)
    position.value = 1;
  else
    position.value = (player.currentTime * 100 / player.duration);

  updateDisplayedTime();
}

/**
 * Changes the volume according to the slider position.
 */
function changeVolume() {
  player.volume = document.getElementsByClassName('volume-regulator')[0].value;
}

/**
 * Toggles mute on click.
 */
function toggleMute() {
  if (!player.muted) {
    player.muted = true;
    volumeBut.src = "res/mute.png";
  } else {
    player.muted = false;
    volumeBut.src = "res/volume.png";
  }
}

/**
 * The boot and the listeners' logic.
 */
window.onload = function () {
  initLoader();

  loadSongs();

  player.addEventListener("ended", nextSongOnEnd);
  position.addEventListener('input', changeTime);
  player.addEventListener("timeupdate", moveSlider);
  document.getElementsByClassName('volume-regulator')[0].addEventListener("input", changeVolume);
  volumeBut.addEventListener("click", toggleMute);

  navigator.mediaSession.setActionHandler('previoustrack', () => {
    previousSong();
  });

  navigator.mediaSession.setActionHandler('nexttrack', () => {
    nextSong();
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    toggleMusic();
    navigator.mediaSession.playbackState = 'paused';
  });

  navigator.mediaSession.setActionHandler('play', () => {
    toggleMusic();
    navigator.mediaSession.playbackState = 'playing';
  });
}
