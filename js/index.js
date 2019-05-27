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
const proxyurl = "https://cors-anywhere.herokuapp.com/";
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
	//console.log(playlist_id);
	var api_key = "AIzaSyA1WacRnHogHgbFFQt5r3AUcRj5F0Tqg-4";
	var pt = (typeof pagetoken === "undefined") ? "" : `&pageToken=${pagetoken}`;
	var request_link = 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId='+playlist_id+'&key='+api_key+`${pt}`;
	//console.log(request_link);
	return request_link;
	}

function apiCall(event){
	document.getElementById('ol').style.display="block";
	document.getElementById('load_spinner').style.display="block";
	final_links.length=0;
	final_names.length=0;
	backup_links.length=0;
	backup_names.length=0;
	extracted.length=0;
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
		//console.log(final_links);
		//console.log(final_names);
		backup_links=final_links;
		backup_names=final_names;
		shuffle_music();
	}
}
async function shuffle_music(){
	let audiopl = document.getElementById('music_player');
	audiopl.pause();
	audiopl.currentTime=0;
	if (final_links.length==0){
		console.log('Load playlist first!');
	} else{
		let n;
		if (final_links.length<=20){
			n = final.links.length;
		} else {
			n=20;
		}
		//let shuffled = final_links.sort(() => 0.5 - Math.random());
		//let selected = shuffled.slice(0,n);
		//console.log(selected);
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
	console.log(shuffled_links);
	console.log(shuffled_names); 
	let src_start = await get_direct_links(shuffled_links[0]);
	final.push(src_start);
	audiopl.src=proxyurl+src_start;
	toggle_music();
	document.getElementById('ol').style.display="none";
	document.getElementById('load_spinner').style.display="none";


	}
}	
async function get_direct_links(link){
	extractor_link.push("https://ytoffline.net/download/?url=https://www.youtube.com/watch?v="+link);
	await fetch(proxyurl + extractor_link[extractor_link.length-1]) 
	     .then(response => response.text())
	     .then(contents => { extracted.push(parseContent(contents)); })
	console.log(extracted);
	return extracted[extracted.length-1]
}
	/*document.getElementById('music_player').pause();
	document.getElementById('music_player').currentTime=0;
	var ctr = final_links.length;
	let index, temp1, temp2;
	if (ctr!=0){
		while (ctr>0){
			index = Math.floor(Math.random() * ctr);
			ctr--;
			temp1 = final_links[ctr];
			temp2 = final_names[ctr];
			final_names[ctr]=final_names[index];
			final_names[index]=temp2;
			final_links[ctr]=final_links[index];
			final_links[index]=temp1;
		}
	} else {console.log("This playlist is empty!")}
	for (let i=0; i<final_links.length;i++){
		//extractor_link[i] = "https://ytoffline.net/download/?url=https://www.youtube.com/watch?v="+ final_links[i];
		//console.log(extractor_link[i]);

extractor_link.push("https://ytoffline.net/download/?url=https://www.youtube.com/watch?v="+final_links[i]);
				//event.preventDefault();
		    	fetch(proxyurl + extractor_link[i]) 
		    	.then(response => response.text())
		    	.then(contents => {extracted.push(parseContent(contents)); })
	    // event.preventDefault();

	    // const proxyurl = "https://cors-anywhere.herokuapp.com/";
	    // fetch(proxyurl + extractor_link[i]) 
	    // .then(response => response.text())
	    // .then(contents => { extracted[i]=parseContent(contents); })
	    // console.log(extracted[i]);
	    // console.log(final_names[i]);*/
	//}
	//setTimeout(function() {}, 3000);
	//document.getElementById('music_player').src=extracted[1];
	//console.log(extracted[1]);
	//document.getElementById('music_player').play();
	

function next_music(){
	document.getElementById('music_player').pause();
	document.getElementById('music_player').currentTime = 0;

}
function previous_music(){
}

function download_audio(event){
	/*var ind = full_link.search("v=");
	if (!full_link.includes("v=") && !full_link.includes("youtube")){
		console.log("Wrong link!");
	}*/
		// extractor_link = "https://ytoffline.net/download/?url=https://www.youtube.com/watch?v="+ final_links;
		// console.log(extractor_link);


	 //    event.preventDefault();

	 //    const proxyurl = "https://cors-anywhere.herokuapp.com/";
	 //    fetch(proxyurl + extractor_link) 
	 //    .then(response => response.text())
	 //    .then(contents => { parseContent(contents); })
	 //    document.getElementById('music_player').src=music_link;
	   // console.log(music_link);

}

function parseContent(content){
		var contentObject = $(content);
		var found = $('a[data-formatid="251"]',contentObject);
		var music_link = $(found[0]).attr("href");
		console.log(music_link);
		return music_link;
	}
function toggle_music(){
		let audiopl = document.getElementById('music_player');
		let button = document.getElementById('toggle_button');
		if (audiopl.src!='' && audiopl.paused){
			audiopl.play();
			button.src="res/pause.png";
		} else if (audiopl.src!='' && !audiopl.paused){
			audiopl.pause();
			button.src="res/play.png"
		} else if (audiopl.src==''){}
}




