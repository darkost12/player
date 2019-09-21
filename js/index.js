/**
 * Gets songs from yadi through REST API and puts in the custom WEB-player. 
 */
var received_names = [];	//The information received from the API-call before shuffle.
var transitional_names = [];//The information in the shuffle process.
var shuffled_names = [];	//The information after the shuffle process. Ready to be put in the actual play.
var current_song;			//The global identificator of currently playing song
var play_flag;				//The Boolean flag of playing status.
var audiopl = document.getElementById('music_player');		//The link to the <audio> element in your HTML code.
var song_name = document.getElementById('song_name');		//The link to the <p>/<h> element.
var tog_but = document.getElementById('toggle_button');		//The link to the <img> element.
var vol_but = document.getElementById('volume_button');		//The link to the <img> element.
var position = document.getElementById('current_position');	//The link to the <input type="range"> element.
var timing = document.getElementById('current_time');		//The link to the <div> element.
var audioContext, visualctx, audioSrc, analyser;			//Variables for audioContext analysis.
var canvas, cwidth, cheight, meterWidth, gap, capHeight, capStyle, meterNum;		//Canvas and bars variables.
window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;	//Automatic detection of webkit.

/**
 * Shuffles music after getting through API call.
 */
function shuffle_music() {
	song_name.style.display = 'none';
	audiopl.currentTime = 0;
	play_flag = false;
	audiopl.pause();
	tog_but.src = "res/play.png";
	let ctr = received_names.length;	//Fisher-Yates shuffle algorithm
	let index, temp;
	transitional_names = received_names;
	while (ctr>0) {
		index = Math.floor(Math.random() * ctr);
		ctr--;
		temp = transitional_names[ctr];
		transitional_names[ctr] = transitional_names[index];
		transitional_names[index] = temp;	
	}
	shuffled_names = transitional_names;
	console.log('Shuffle was performed successfully!');
	current_song = 0;
	show();
}

/**
 * Loads the first element of shuffled song array to the HTML. Also turns off the overlay.
 */	
function show() {
	position.value = 1;
	if (audiopl.paused && audiopl.src == '') {
		audiopl.src = get_link(shuffled_names[0]);
		change_title();
		document.getElementById('overlay').style.display = "none";
		document.getElementById('load_spinner').style.display = "none";
	}
}

/**
 * Changes title of song on switch. Also removes extension from the title.
 */	
function change_title() {
	let title = shuffled_names[current_song];
	song_name.innerHTML = title.slice(0, (title.length - 4));
	if (song_name.style.display == 'none')
		song_name.style.display = 'inline-block';
}

/**
 * Actually toggles music and changes button source image.
 */
function toggle() {
	if (play_flag == true) {
		audiopl.play();
		tog_but.src = "res/pause.png";
	} else {
		audiopl.pause();
		tog_but.src = "res/play.png"
	}
}
/**
 * Sets the logic of toggle button. Also opens/closes contexts.
 */
function toggle_music() {
	if (audiopl.src != '' && audiopl.paused)
		open_context();
	else if (audiopl.src != '' && !audiopl.paused)
		close_context();
	toggle();
}


/**
 * Sets the logic of next song button. Also changes visuals.
 */
function next_music() {
	close_context();
	reset_defaults();
	current_song += 1;
	if (current_song > (shuffled_names.length - 1))
		current_song = 0;
	audiopl.src = get_link(shuffled_names[current_song]);
	open_context();
	toggle();
	change_title();
}

/**
 * Resets slider variables to defaults.
 */
function reset_defaults() {
	position.value = 1;
	audiopl.currentTime = 0;
}

/**
 * Sets the logic of previous song button. Also visual changes.
 */
function previous_music() {
	close_context();
	reset_defaults();
	current_song -= 1;
	if (current_song < 0)
		current_song = shuffled_names.length - 1;
	audiopl.src = get_link(shuffled_names[current_song]);
	open_context();
	toggle();
	change_title();
}

/**
 * Gets signed link via GET request using "Key" parameter.
 * @param {string} title. Song[i].Key (title of song).
 * @return {string} url. Signed url for audio.src.
 */
function get_link(title) {
	return "https://public-music-storage.s3.amazonaws.com/" + title;
}

/**
 * Opens new context for current song.
 */
function open_context() {
	play_flag = true;
	// If there is no active audio context, it opens new.
	if(audioContext === undefined) {
		audioContext = new AudioContext();
		// If the source is already connected to context, nothing happens.
		if (audioSrc === undefined)
			audioSrc = audioContext.createMediaElementSource(audiopl);
		console.log("Created AudioContext");
		console.log("Sample rate: " + audioContext.sampleRate);
	}
	analyser = audioContext.createAnalyser();
	audioSrc.connect(analyser);
	analyser.connect(audioContext.destination);
	analyser.smoothingTimeConstant = 0.7;
	analyser.fftSize = 512;
	
	console.log('AudioContext is up, sample rate: ' + audioContext.sampleRate);
	
	/**
	 * Gets pixel ratio of current device for correct drawing on canvas with high sharpness.
 	 * @param {canvas object} canvas.
	 * @return {canvas_context} ctx.
	 */
	function setupCanvas(canvas) {
		var dpr = window.devicePixelRatio || 1;
		var rect = canvas.getBoundingClientRect();
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		var ctx = canvas.getContext('2d');
		ctx.scale(dpr, dpr);
		return ctx;
	}
	
	canvas = document.getElementById('canvas');
	visualctx = setupCanvas(canvas);
	
	
    render_frame();
}

/**
 * Stops music, resets slider variables to minimum, and closes context on switching to the next song.
 */
async function close_context() {
	play_flag = false;
	audiopl.pause();
	if(audioContext !== undefined) {
		audioSrc.disconnect();
		analyser.disconnect();
		console.log('AudioContext has been closed');
	}
}

/**
 * Draws new frame of spectrum visualization.
 */
function render_frame() {
    const ctx = visualctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const capHeight = 2;
    const barSpacing = 15;
    const barWidth = 7;
    const barHeight = canvas.height - capHeight;
    const nOfBars = Math.round(canvas.width/barSpacing);
    
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);
    
    const styles = {
    	cap_style: '#fff',
    	gradient: (() => {
    		const g = ctx.createLinearGradient(0, barHeight, 0, 0);
		    g.addColorStop(1, '#0f3443');
		    g.addColorStop(0.5, '#34e89e');
		    g.addColorStop(0, 'hsl( 120, 100%, 50% )');
		    return g;
    	})()
    };
    // Setting of upper limit on bars so there is no empty bars at the end any more.
    const frequencyUpper = audioContext.sampleRate / 2;
    const frequencyLimit = Math.min(16e3, frequencyUpper);
    
    // Frequency step per bar.
    const step = 
    	(frequencyData.length * (frequencyLimit / frequencyUpper) - 1) 
		/ (nOfBars - 1);
    
    for(let i = 0; i < nOfBars; i++) {
    	// Normalized value (0..1) - proportion 'bar_height/canvas_height'.
    	const value = frequencyData[Math.floor(i * step)] / 255;
    	//  _____________
    	// |------- y = 0
    	// |---||-- y = capHeight
    	// |---||--
    	// |---||--
    	// |---||-- y = barHeight + capHeight
    
    	// Bar
    	ctx.fillStyle = styles.gradient;
    	ctx.fillRect(barSpacing / 2 + i * barSpacing,
    		barHeight - barHeight * value + capHeight,
    		barWidth,
    		barHeight - barHeight * (1 - value)
    	);
     	// Top of the bar (cap)
    	ctx.fillStyle = styles.cap_style;
    	ctx.fillRect(
    		barSpacing / 2 + i * barSpacing,
    		barHeight - barHeight * value,
    		barWidth,
    		capHeight
    	);
    }
   	// Closure
    requestAnimationFrame(render_frame);
}

/**
 * The boot and the listeners' logic.
 */
window.onload = function() {
	/**
	 * Loads the overlay at the very beginning.
	 */
	(function init_overlay() {
		document.getElementById('overlay').style.display = "block";
		document.getElementById('load_spinner').style.display = "block";
	})();
	
	/**
	 * Ajax call. Gets information in "Key" field of objects on disk.
	 */
	(function load_songs() {
		$.ajax({
			type: "GET",
			url: 'https://public-music-storage.s3.amazonaws.com/',
			dataType: "xml",
			success: function (xml) {
				$(xml).find('Key').each(function() {
					received_names.push(this.innerHTML);
				});
	            console.log("Songs were received successfully!");
	            shuffle_music();
			}
		});
	})();
	
	/**
	 * Switches to the next song if the previous has ended.
	 */
	audiopl.addEventListener("ended", ended_next);

	function ended_next() {
		current_song += 1;
		if (current_song > (shuffled_names.length - 1))
			current_song = 0;
		change_title();
		audiopl.src = get_link(shuffled_names[current_song]);
		audiopl.play();
	}

	/**
	 * Updates displayed current time.
	 */
	position.addEventListener('input', change_time);

	function change_time() {
		if (audiopl.paused)
			play_flag = false;
		else
			play_flag = true;
		audiopl.currentTime = audiopl.duration / 100 * position.value;
		if (Math.floor(audiopl.currentTime % 60) < 10)
			timing.innerHTML = Math.floor(audiopl.currentTime / 60) + ':0' + Math.floor(audiopl.currentTime % 60);
		else
			timing.innerHTML = Math.floor(audiopl.currentTime / 60) + ':' + Math.floor(audiopl.currentTime % 60);
		if (play_flag == true)
			audiopl.play();
	};

	/**
	 * Moves slider according to current time.
	 */
	audiopl.addEventListener("timeupdate", move_slider); 

	function move_slider() {
		if (audiopl.currentTime == 0)
			position.value = 1;
		else
			position.value = (audiopl.currentTime * 100 / audiopl.duration);
		
		if (Math.floor(audiopl.currentTime % 60) < 10)
			timing.innerHTML = Math.floor(audiopl.currentTime / 60) + ':0' + Math.floor(audiopl.currentTime % 60);
		else 
			timing.innerHTML = Math.floor(audiopl.currentTime / 60) + ':' + Math.floor(audiopl.currentTime % 60);
	}

	/**
	 * Changes the volume according to the slider position.
	 */
	document.getElementById('volume_regulator').addEventListener("input", change_volume);

	function change_volume() {
		audiopl.volume = document.getElementById('volume_regulator').value;
	}

	/**
	 * Toggles mute on click.
	 */
	vol_but.addEventListener("click", toggle_mute);

	function toggle_mute() {
		if (!audiopl.muted) {
			audiopl.muted = true;
			vol_but.src = "res/mute.png";
		} else {
			audiopl.muted = false;
			vol_but.src = "res/volume.png";
		}
	}
}