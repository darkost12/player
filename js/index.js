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
var checked_names=[];
var checked_links=[];
var currentSong;
const proxyurl = "https://cors-anywhere.herokuapp.com/";
const proxyurl2 = "https://crossorigin.me/";
function get_playlist(pagetoken){
	var full_link_playlist = document.getElementById('youtube_playlist_link').value;
	if (document.getElementById('youtube_playlist_link').value==1){
		full_link_playlist="youtube.com/playlist?list=PLCIr_Hu3lJm9rfu8kSOU3k-THm7-ICJiM";
	}
	if (document.getElementById('youtube_playlist_link').value==2){
		full_link_playlist="youtube.com/playlist?list=PLDD6Y2H0h_vCWvI2zoPjNc9jg1Y7riBtf";
	}
	if (document.getElementById('youtube_playlist_link').value==3){
		full_link_playlist="youtube.com/playlist?list=PLHwn8cKeb1J2TOechY-gogb9DZNwIwzIJ";
	}
	var index = full_link_playlist.search("list=");
	var playlist_id=full_link_playlist.slice(index+5,index+39);
	var api_key = "AIzaSyA1WacRnHogHgbFFQt5r3AUcRj5F0Tqg-4";
	var pt = (typeof pagetoken === "undefined") ? "" : `&pageToken=${pagetoken}`;
	var request_link = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId='+playlist_id+'&key='+api_key+`${pt}`;
	return request_link;
}

function apiCall(event){
	document.getElementById('ol').style.display="block";
	document.getElementById('load_spinner').style.display="block";
	if (!document.getElementById('music_player').paused){
		pause();
	}
	final_links.length=0;
	final_names.length=0;
	backup_links.length=0;
	backup_names.length=0;
	extracted.length=0;
	currentSong=0;
	event.preventDefault();
	fg();
}

function fg(npt){
	fetch(get_playlist(npt))
  		.then(response => {
  		let resp = response.json();
  	   	return resp;
  	})
  	.then(response => {
    	if(response.error){
        	console.log(response.error);
      	} else {
        	responseHandler(response);
      	}
  });
}
function responseHandler(response){
	for (let i=0; i < ((response.items).length); i++){
				final_links.push(response.items[i].snippet.resourceId.videoId);
				final_names.push(response.items[i].snippet.title);
			}
	if(response.nextPageToken){
		fg(response.nextPageToken);
	} else {
		backup_links=final_links;
		backup_names=final_names;
		shuffle_music();
	}
}
async function shuffle_music(){
	let audiopl = document.getElementById('music_player');
	audiopl.pause();
	audiopl.currentTime=0;
	document.getElementById('song_name').style.display='none';
	document.getElementById('toggle_button').src="res/play.png";
	if (final_links.length==0){
		console.log('Load playlist first!');
	} else{
		let n;
		if (final_links.length<=40){
			n = final.links.length;
		} else {
			n=40;
		}
		let ctr = final_links.length;
		let index, temp1, temp2;
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
	
		
	shuffled_links=backup_links.slice(0,n);
	shuffled_names=backup_names.slice(0,n);

	load_music();
	}
}	

async function get_direct_links(link){
	extractor_link.push("https://ytoffline.net/download/?url=https://www.youtube.com/watch?v="+link);
	await fetch(proxyurl + extractor_link[extractor_link.length-1]) 
	     .then(response => response.text())
	     .then(contents => { extracted.push(parseContent(contents)); })
	return extracted[extracted.length-1]
}

function next_music(){
	let audiopl = document.getElementById('music_player');
	document.getElementById('currentPosition').value=1;
	audiopl.pause();
	audiopl.currentTime = 0;
	currentSong+=1;
	if (currentSong>(checked_links.length-1)){
		currentSong=0;
	}
	audiopl.src = checked_links[currentSong];
	audiopl.play();
	/*document.getElementById('song_duration').innerHTML=document.getElementById('music_player').duration;*/
	document.getElementById('song_name').innerHTML=checked_names[currentSong];
	document.getElementById('song_name').style.display='inline-block';

}

function previous_music(){
	let audiopl = document.getElementById('music_player');
	document.getElementById('currentPosition').value=1;
	audiopl.pause();
	audiopl.currentTime = 0;
	currentSong-=1;
	if (currentSong<0)
	{
		currentSong=checked_links.length-1;
	}
	audiopl.src = checked_links[currentSong];
	audiopl.play();
	document.getElementById('song_name').innerHTML=checked_names[currentSong];
	document.getElementById('song_name').style.display='inline-block';
	/*document.getElementById('song_duration').innerHTML=document.getElementById('music_player').duration;*/

}

function parseContent(content){
		var contentObject = $(content);
		var found = $('a[data-formatid="251"]',contentObject);
		var music_link = $(found[0]).attr("href");
		return music_link;
}

function toggle_music(){
		let audiopl = document.getElementById('music_player');
		let button = document.getElementById('toggle_button');
		if (audiopl.src!='' && audiopl.paused){
			audiopl.play();
			button.src="res/pause.png";
			document.getElementById('song_name').innerHTML=checked_names[currentSong];
			document.getElementById('song_name').style.display='inline-block';
		} else if (audiopl.src!='' && !audiopl.paused){
			audiopl.pause();
			button.src="res/play.png"
			document.getElementById('song_name').innerHTML=checked_names[currentSong];
			document.getElementById('song_name').style.display='inline-block';
		} else if (audiopl.src==''){}
}

async function load_music(){
	let audiopl = document.getElementById('fake_player');
	for (let i=0; i< shuffled_links.length; i++){
		let source_link = await get_direct_links(shuffled_links[i]);
		var mySound = new Audio(source_link);
		console.log(source_link);
		$(mySound).on("canplay",function(){
			checked_links.push(source_link);
			checked_names.push(shuffled_names[i]);
			console.log('Success'+i);
			document.getElementById('ol').style.display="none";
			document.getElementById('load_spinner').style.display="none";
			play_music();
		});

	}
	console.log(checked_links);
}
function play_music(){
		let audiopl = document.getElementById('music_player');
		let button = document.getElementById('toggle_button');
		if (audiopl.paused && audiopl.src==''){
			audiopl.src=checked_links[0];
			audiopl.play();
			//console.log(document.getElementById('music_player').duration);
			button.src="res/pause.png";
			document.getElementById('song_name').innerHTML=checked_names[currentSong];
			document.getElementById('song_name').style.display='inline-block';
			/*document.getElementById('song_duration').innerHTML=document.getElementById('music_player').duration;*/
		}
		if (!audiopl.paused){

		}
}
window.onload=function(){
	document.getElementById('music_player').addEventListener("ended", ended_next);
	function ended_next(){
		currentSong+=1;
			if (currentSong>(checked_links.length-1)){
				currentSong=0;
			}
		document.getElementById('song_name').innerHTML=checked_names[currentSong];
		document.getElementById('music_player').src=checked_links[currentSong];
		document.getElementById('music_player').play();
		document.getElementById('toggle_button').src="res/pause.png";
		/*document.getElementById('song_duration').innerHTML=document.getElementById('music_player').duration;*/
	}
	document.getElementById('currentPosition').addEventListener('input', change_time);
	function change_time(){
		document.getElementById('music_player').currentTime=document.getElementById('music_player').duration/100*document.getElementById('currentPosition').value;
		if (Math.floor(document.getElementById('music_player').currentTime%60)<10){
			document.getElementById('current').innerHTML=Math.floor(document.getElementById('music_player').currentTime/60)+':0'+Math.floor(document.getElementById('music_player').currentTime%60);
		} else {
			document.getElementById('current').innerHTML=Math.floor(document.getElementById('music_player').currentTime/60)+':'+Math.floor(document.getElementById('music_player').currentTime%60);
		}
		document.getElementById('music_player').play();
	};
	document.getElementById('music_player').addEventListener("timeupdate", move_slider); 
	function move_slider(){

		document.getElementById('currentPosition').value=Math.floor(document.getElementById('music_player').currentTime*100/document.getElementById('music_player').duration);
		if (Math.floor(document.getElementById('music_player').currentTime%60)<10){
			document.getElementById('current').innerHTML=Math.floor(document.getElementById('music_player').currentTime/60)+':0'+Math.floor(document.getElementById('music_player').currentTime%60);
		} else {
			document.getElementById('current').innerHTML=Math.floor(document.getElementById('music_player').currentTime/60)+':'+Math.floor(document.getElementById('music_player').currentTime%60);
		}
	}
	//document.getElementById('music_player').addEventListener("play", !!!!!!!!!!!!!хрень сюда!!!!!!!!);
//!!!!!!!!!!!!хрень сюда!!!!!! 
}

