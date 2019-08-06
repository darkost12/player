const token = "AgAAAAA0yS9YAAW1uI7_-EdJd0PdvwziNnu2bxo";
/**
 *Gets songs from yadi through REST API and puts in the custom WEB-player. 
 */
	var received_links = [];	//The information received from the API-call --
	var received_names = [];		//-- before shuffle.
	var transitional_links=[];	//Are used only during --
	var transitional_names=[];		// -- the shuffle process.
	var shuffled_names =[];		//The information after --
	var shuffled_links =[];			// --  the shuffle process. Ready to be put in the actual play.
	var current_song;			//The global identificator of currently playing song
	var play_flag;				//The Boolean flag of playing status.
	var audiopl = document.getElementById('music_player');		//The link to the <audio> element in your HTML code.
	var song_name = document.getElementById('song_name');		//The link to the <p>/<h> element.
	var tog_but = document.getElementById('toggle_button');		//The link to the <img> element.
	var vol_but = document.getElementById('volume_button');		//The link to the <img> element.
	var position = document.getElementById('current_position');	//The link to the <input type="range"> element.
	var timing = document.getElementById('current_time');		//The link to the <div> element.
	var audioContext;
	var visualctx;
	var audioSrc;
	var analyser;
	var canvas,
        cwidth,
        cheight,
        meterWidth, //width of the meters in the spectrum
        gap, //gap between meters
        capHeight,
        capStyle,
        meterNum, //count of the meters
        capYPositionArray;
	window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;

/**
 *Shuffles music after getting through API call.
 */
function shuffle_music(){
	audiopl.pause();
	audiopl.currentTime=0;
	song_name.style.display='none';
	tog_but.src="res/play.png";
	let ctr = received_links.length;	//Fisher-Yates shuffle algorithm
	let index, temp1, temp2;
	transitional_links=received_links;
	transitional_names=received_names;
	while (ctr>0){
		index = Math.floor(Math.random() * ctr);
		ctr--;
		temp1 = transitional_links[ctr];
		transitional_links[ctr]=transitional_links[index];
		transitional_links[index]=temp1;
		temp2 = transitional_names[ctr];
		transitional_names[ctr]=transitional_names[index];
		transitional_names[index]=temp2;	
	}
	shuffled_links=transitional_links;
	shuffled_names=transitional_names;
	console.log('Shuffle was performed successfully!');
	current_song=0;
	show();
}


/**
 *Loads the first element of shuffled song array to the HTML. Also turns off the overlay.
 */	
function show(){
		position.value=1;
		let button = tog_but;
		if (audiopl.paused && audiopl.src==''){
			audiopl.src=shuffled_links[0];
			song_name.innerHTML=shuffled_names[current_song];
			song_name.style.display='inline-block';
			document.getElementById('overlay').style.display="none";
			document.getElementById('load_spinner').style.display="none";
		}
		if (!audiopl.paused){
		}
}	

/**
 *Sets the logic of toggle button.
 */
function toggle_music(){
	let button = tog_but;
	if (audiopl.src!='' && audiopl.paused){
		open_context();
		audiopl.play();
		play_flag=true;
		button.src="res/pause.png";
		song_name.innerHTML=shuffled_names[current_song];
		song_name.style.display='inline-block';
	} else if (audiopl.src!='' && !audiopl.paused){
		close_context();
		audiopl.pause();
		play_flag=false;
		button.src="res/play.png"
		song_name.innerHTML=shuffled_names[current_song];
		song_name.style.display='inline-block';
	} else if (audiopl.src==''){}
}

/**
 *Sets the logic of next song button.
 */
function next_music(){
	close_context();
	tog_but.src="res/pause.png";
	position.value=1;
	audiopl.pause();
	play_flag=false;
	audiopl.currentTime = 0;
	current_song+=1;
	if (current_song>(shuffled_links.length-1)){
		current_song=0;
	}
	audiopl.src = shuffled_links[current_song];
	open_context();
	audiopl.play();
	play_flag=true;
	song_name.innerHTML=shuffled_names[current_song];
	song_name.style.display='inline-block';
}


/**
 *Sets the logic of previous song button.
 */
function previous_music(){
	tog_but.src="res/pause.png";
	position.value=1;
	close_context();
	audiopl.pause();
	play_flag=false;
	audiopl.currentTime = 0;
	current_song-=1;
	if (current_song<0)
	{
		current_song=shuffled_links.length-1;
	}
	audiopl.src = shuffled_links[current_song];
	open_context();
	audiopl.play();
	play_flag=true;
	song_name.innerHTML=shuffled_names[current_song];
	song_name.style.display='inline-block';
}
function open_context(){
	if(audioContext === undefined) {
		audioContext = new AudioContext();
		if (audioSrc === undefined){
			audioSrc = audioContext.createMediaElementSource(audiopl);
		}
		
		console.log("Created AudioContext");
		console.log("Sample rate: " + audioContext.sampleRate);
	}
	analyser = audioContext.createAnalyser();
	audioSrc.connect(analyser);
	analyser.connect(audioContext.destination);
	analyser.smoothingTimeConstant = 0.7;
//	analyser.fftSize = 512;
	
	console.log('AudioContext is up, sample rate: ' + audioContext.sampleRate);
	
	function setupCanvas(canvas) {
		// See https://www.html5rocks.com/en/tutorials/canvas/hidpi/
		
		// Get the device pixel ratio, falling back to 1.
		var dpr = window.devicePixelRatio || 1;
		// Get the size of the canvas in CSS pixels.
		var rect = canvas.getBoundingClientRect();
		// Give the canvas pixel dimensions of their CSS
		// size * the device pixel ratio.
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		var ctx = canvas.getContext('2d');
		// Scale all drawing operations by the dpr, so you
		// don't have to worry about the difference.
		ctx.scale(dpr, dpr);
		return ctx;
	}
	
	canvas = document.getElementById('canvas');
	visualctx = setupCanvas(canvas);
	
	
    renderFrame();
}

async function close_context(){
	audioSrc.disconnect();
	analyser.disconnect();
	console.log('AudioContext has been closed');
}

function renderFrame() {
    const ctx = visualctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const capHeight = 2;
    
    const barSpacing = 8;
    const barWidth = 3;
    const barHeight = canvas.height - capHeight;
    
    const nOfBars = Math.round(canvas.width/barSpacing);
    
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);
    // analyser.getByteTimeDomainData(frequencyData);
    
    const styles = {
    	cap_style: '#fff',
    	gradient: (() => {
    		const g = ctx.createLinearGradient(0, barHeight, 0, 0);
		    g.addColorStop(1, '#0f0');
		    g.addColorStop(0.5, '#ff0');
		    g.addColorStop(0, '#f00');
		    return g;
    	})()
    };
    
    const frequencyUpper = audioContext.sampleRate / 2;
    const frequencyLimit = Math.min(16e3, frequencyUpper);
    
    const step = 
    	(frequencyData.length * (frequencyLimit / frequencyUpper) - 1) 
		/ (nOfBars - 1);
    
    for(let i = 0; i < nOfBars; i++) {
    	// Normalized value (0..1)
    	const value = frequencyData[Math.floor(i * step)] / 255;
    	
    	// |------- y = 0
    	// |---||-- y = capHeight
    	// |---||--
    	// |---||--
    	// |---||-- y = barHeight + capHeight
    	
    	// Bar
    	ctx.fillStyle = styles.gradient;
    	ctx.fillRect(
    		barSpacing / 2 + i * barSpacing,
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
   
    requestAnimationFrame(renderFrame);
}

/**
 *The boot and the listeners' logic.
 */
window.onload=function(){
	/**
	 *Loads the overlay at the very beginning.
	 */
	document.getElementById('overlay').style.display="block";
	document.getElementById('load_spinner').style.display="block";

		/**
		 *REST API call. Returns direct links to songs and their names.
		 */
	$.ajax({
		url: 'https://cloud-api.yandex.net:443/v1/disk/resources/files?limit=2000',
            type: 'GET',
            dataType: 'json',
            contentType: "application/json",
            beforeSend: function(xhr) {
                 xhr.setRequestHeader("Authorization", token)
            },
            success: function(data){
            	for (let i=0; i<(data.items).length;i++){
            		received_names.push(((data.items)[i].name).slice(0,((data.items)[i].name).length-4));
            		received_links.push((data.items)[i].file);
            	}
            	console.log('Songs were received successfully!');
            	shuffle_music();
            }
        });
	
		/**
		 *Switches to the next song if the previous has ended.
		 */
	audiopl.addEventListener("ended", ended_next);
	function ended_next(){
		current_song+=1;
			if (current_song>(shuffled_links.length-1)){
				current_song=0;
			}
		song_name.innerHTML=shuffled_names[current_song];
		audiopl.src=shuffled_links[current_song];
		audiopl.play();
		tog_but.src="res/pause.png";
	}

		/**
		 *Updates displayed current time.
		 */
	position.addEventListener('input', change_time);
	function change_time(){
		if (audiopl.paused){
			play_flag=false;
		}
		else {
			play_flag=true;
		}
		audiopl.currentTime=audiopl.duration/100*position.value;
		if (Math.floor(audiopl.currentTime%60)<10){
			timing.innerHTML=Math.floor(audiopl.currentTime/60)+':0'+Math.floor(audiopl.currentTime%60);
		} else {
			timing.innerHTML=Math.floor(audiopl.currentTime/60)+':'+Math.floor(audiopl.currentTime%60);
		}
		if (play_flag==true){
			audiopl.play();
		}
	};

		/**
		 *Moves slider according to current time.
		 */
	audiopl.addEventListener("timeupdate", move_slider); 
	function move_slider(){
		if (audiopl.currentTime==0){
			position.value=1;
		}else{
		position.value=(audiopl.currentTime*100/audiopl.duration);
		}
		if (Math.floor(audiopl.currentTime%60)<10){
			timing.innerHTML=Math.floor(audiopl.currentTime/60)+':0'+Math.floor(audiopl.currentTime%60);
		} else {
			timing.innerHTML=Math.floor(audiopl.currentTime/60)+':'+Math.floor(audiopl.currentTime%60);
		}
	}

	/**
		 *Changes the volume according to the slider position.
		 */
	document.getElementById('volume_regulator').addEventListener("input", change_volume);
	function change_volume(){
		audiopl.volume = document.getElementById('volume_regulator').value;
	}

	/**
		 *Toggles mute on click.
		 */
	vol_but.addEventListener("click", toggle_mute);
	function toggle_mute(){
		if (audiopl.src==''){
		}
		if (!audiopl.muted){
			audiopl.muted=true;
			vol_but.src="res/mute.png";
		} else{
			audiopl.muted=false;
			vol_but.src="res/volume.png";
		}
	}

}


