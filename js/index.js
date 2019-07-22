var final_links = [];
var final_names = [];
var song_id=[];
var extractor_link=[];
var extracted=[];
var shuffled_names =[];
var shuffled_links =[];
var backup_links=[];
var backup_names=[];
var final=[];
var currentSong;
var play_flag;
const token = "AgAAAAA0yS9YAAW1uI7_-EdJd0PdvwziNnu2bxo";
const proxyurl = "https://cors-anywhere.herokuapp.com/";
const proxyurl2 = "https://googleweblight.com/?lite_url=";
const yadi = "https://cloud-api.yandex.net/v1/disk/resources/files";


async function shuffle_music(){
	let audiopl = document.getElementById('music_player');
	audiopl.pause();
	audiopl.currentTime=0;
	document.getElementById('song_name').style.display='none';
	document.getElementById('toggle_button').src="res/play.png";
	let ctr = final_links.length;
	let index, temp1, temp2;
	backup_links=final_links;
	backup_names=final_names;
	while (ctr>0){
		index = Math.floor(Math.random() * ctr);
		ctr--;
		temp1 = backup_links[ctr];
		backup_links[ctr]=backup_links[index];
		backup_links[index]=temp1;
		temp2 = backup_names[ctr];
		backup_names[ctr]=backup_names[index];
		backup_names[index]=temp2;	
	}
	shuffled_links=backup_links;
	shuffled_names=backup_names;
	currentSong=0;
	play_music();
}
	


function next_music(){
	document.getElementById('toggle_button').src="res/pause.png";
	document.getElementById('currentPosition').value=1;
	let audiopl = document.getElementById('music_player');
	audiopl.pause();
	play_flag=false;
	audiopl.currentTime = 0;
	currentSong+=1;
	if (currentSong>(shuffled_links.length-1)){
		currentSong=0;
	}
	audiopl.src = shuffled_links[currentSong];
	
	audiopl.play();
	play_flag=true;
	/*document.getElementById('song_duration').innerHTML=document.getElementById('music_player').duration;*/
	document.getElementById('song_name').innerHTML=shuffled_names[currentSong];
	document.getElementById('song_name').style.display='inline-block';

}

function previous_music(){
	document.getElementById('toggle_button').src="res/pause.png";
	document.getElementById('currentPosition').value=1;
	let audiopl = document.getElementById('music_player');
	audiopl.pause();
	play_flag=false;
	audiopl.currentTime = 0;
	currentSong-=1;
	if (currentSong<0)
	{
		currentSong=shuffled_links.length-1;
	}
	audiopl.src = shuffled_links[currentSong];
	audiopl.play();
	play_flag=true;
	document.getElementById('song_name').innerHTML=shuffled_names[currentSong];
	document.getElementById('song_name').style.display='inline-block';
	/*document.getElementById('song_duration').innerHTML=document.getElementById('music_player').duration;*/

}

/*function parseContent(content){
		var contentObject = $(content);
		var found = $('a[data-formatid="251"]',contentObject);
		var music_link = $(found[0]).attr("href");
		return music_link;
}*/

function toggle_music(){
		let audiopl = document.getElementById('music_player');
		let button = document.getElementById('toggle_button');
		if (audiopl.src!='' && audiopl.paused){
			audiopl.play();
			play_flag=true;
			button.src="res/pause.png";
			document.getElementById('song_name').innerHTML=shuffled_names[currentSong];
			document.getElementById('song_name').style.display='inline-block';
		} else if (audiopl.src!='' && !audiopl.paused){
			audiopl.pause();
			play_flag=false;
			button.src="res/play.png"
			document.getElementById('song_name').innerHTML=shuffled_names[currentSong];
			document.getElementById('song_name').style.display='inline-block';
		} else if (audiopl.src==''){}
}


function play_music(){
		document.getElementById('currentPosition').value=1;
		let audiopl = document.getElementById('music_player');
		let button = document.getElementById('toggle_button');
		if (audiopl.paused && audiopl.src==''){
			audiopl.src=shuffled_links[0];
			console.log(audiopl.src);
			console.log(shuffled_names[0]);
			document.getElementById('song_name').innerHTML=shuffled_names[currentSong];
			document.getElementById('song_name').style.display='inline-block';
			document.getElementById('ol').style.display="none";
			document.getElementById('load_spinner').style.display="none";
			document.getElementById('currentPosition').value=1;
			/*document.getElementById('song_duration').innerHTML=document.getElementById('music_player').duration;*/
		}
		if (!audiopl.paused){

		}
}
window.onload=function(){
	document.getElementById('ol').style.display="block";
	document.getElementById('load_spinner').style.display="block";
	$.ajax({
		url: 'https://cors-anywhere.herokuapp.com/https://cloud-api.yandex.net:443/v1/disk/resources/files?limit=2000',
            type: 'GET',
            dataType: 'json',
            contentType: "application/json",
            beforeSend: function(xhr) {
                 xhr.setRequestHeader("Authorization", "AgAAAAA0yS9YAAW1uI7_-EdJd0PdvwziNnu2bxo")
            },
            success: function(data){
            	for (let i=0; i<(data.items).length;i++){
            		final_names.push(((data.items)[i].name).slice(0,((data.items)[i].name).length-4));
            		final_links.push((data.items)[i].file);
            	}
            	//document.getElementById('ol').style.display="none";
				//document.getElementById('load_spinner').style.display="none";
            	shuffle_music();
            }
        });
	
	document.getElementById('music_player').addEventListener("ended", ended_next);
	function ended_next(){
		currentSong+=1;
			if (currentSong>(shuffled_links.length-1)){
				currentSong=0;
			}
		document.getElementById('song_name').innerHTML=shuffled_names[currentSong];
		document.getElementById('music_player').src=shuffled_links[currentSong];
		document.getElementById('music_player').play();
		document.getElementById('toggle_button').src="res/pause.png";
		/*document.getElementById('song_duration').innerHTML=document.getElementById('music_player').duration;*/
	}
	document.getElementById('currentPosition').addEventListener('input', change_time);
	function change_time(){
		if (document.getElementById('music_player').paused){
			play_flag=false;
		}
		else {
			play_flag=true;
		}
		document.getElementById('music_player').currentTime=document.getElementById('music_player').duration/100*document.getElementById('currentPosition').value;
		if (Math.floor(document.getElementById('music_player').currentTime%60)<10){
			document.getElementById('current').innerHTML=Math.floor(document.getElementById('music_player').currentTime/60)+':0'+Math.floor(document.getElementById('music_player').currentTime%60);
		} else {
			document.getElementById('current').innerHTML=Math.floor(document.getElementById('music_player').currentTime/60)+':'+Math.floor(document.getElementById('music_player').currentTime%60);
		}
		if (play_flag==true){
			document.getElementById('music_player').play();
		}
	};
	document.getElementById('music_player').addEventListener("timeupdate", move_slider); 
	function move_slider(){
		if (document.getElementById('music_player').currentTime==0){
			document.getElementById('currentPosition').value=1;
		}else{
		document.getElementById('currentPosition').value=(document.getElementById('music_player').currentTime*100/document.getElementById('music_player').duration);
		}
		if (Math.floor(document.getElementById('music_player').currentTime%60)<10){
			document.getElementById('current').innerHTML=Math.floor(document.getElementById('music_player').currentTime/60)+':0'+Math.floor(document.getElementById('music_player').currentTime%60);
		} else {
			document.getElementById('current').innerHTML=Math.floor(document.getElementById('music_player').currentTime/60)+':'+Math.floor(document.getElementById('music_player').currentTime%60);
		}
		/*HERE COMES SPECTRUM ANALYSIS*/
	}
	document.getElementById('volume_regulator').addEventListener("input", change_volume);
	function change_volume(){
		document.getElementById('music_player').volume = document.getElementById('volume_regulator').value;
	}
	document.getElementById('volume_button').addEventListener("click", toggle_mute);
	function toggle_mute(){
		if (document.getElementById('music_player').src==''){
		}
		if (!document.getElementById('music_player').muted){
			document.getElementById('music_player').muted=true;
			document.getElementById('volume_button').src="res/mute.png";
		} else{
			document.getElementById('music_player').muted=false;
			document.getElementById('volume_button').src="res/volume.png";
		}
	}
	document.getElementById('music_player').addEventListener("play", draw);
	function draw(){

	} 
}

