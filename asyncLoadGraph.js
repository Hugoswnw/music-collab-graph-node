
const request = require('request');
var fs = require('fs');
const entry_point = "6qFt3TjvxMt77YGsktWG8Z";
const db_path = 'french_rap.json';
const regex = /rap|hip hop/;
const delay_step = 200;
var   delay = 0;


function loadDB(path, callback){

    fs.readFile(path, 'utf8', (err, data) => {
        if (err){
            if(err.code=='ENOENT'){
                writeDB(path, {});
                console.log(path+' created!');
                data = JSON.stringify({});
            }
        } else{
            console.log(path+' opened!');
        }
        callback(JSON.parse(data));
    });
}

function writeDB(path, db){
    fs.writeFile(path, JSON.stringify(db, null, 2), 'utf8', (err) => {
        if (err) throw err;
        console.log(path+' saved!');
    });
}

function reloadToken(db, success){
    request({
        url: 'https://accounts.spotify.com/api/token',
        method: 'POST',
        form: {
            'grant_type': 'client_credentials',
            'client_id': "81e657278a2742739d2020bc48963bf5",
            'client_secret': "713df9a23eef4999aa75c2515b937b5f"
        }
    }, function(err, res) {
        if (err) throw err;
        console.log("New token !");
        db.access_token = JSON.parse(res.body).access_token;
        writeDB(db_path, db)
        success(db);
    });
}

function initGraph(db){
    if(!db.graph){
        db.graph = { artists_ids: [entry_point], artists_infos: {}, featurings: {} };
        writeDB(db_path, db);
    }
    search(db)
}

function search(db){
    var new_ids = db.graph.artists_ids.filter(x => !Object.keys(db.graph.artists_infos).includes(x)).slice(0,19);
    console.log(new_ids);
    withDelay(()=>{getArtistInfos(db, new_ids);})
}

function getArtistInfos(db, ids){
    console.log("https://api.spotify.com/v1/artists");
    request({
        url: 'https://api.spotify.com/v1/artists',
        method: 'GET',
        qs: {ids: ids.join(',')},
        headers: {
            'Authorization': 'Bearer '+db.access_token
        }
    }, function(err, res) {
        if (err) throw err;
        if (res.statusCode!=200){
            console.error("Error response code : " + res.statusCode); return;
        }
        var artists = JSON.parse(res.body).artists;
        for (var i = 0; i < artists.length; i++) {
            artist = artists[i];
            console.log(artist.name);
            db.graph.artists_infos[artist.id] = {
                name: artist.name,
                popularity: artist.popularity,
                genre_ok: analyzeGenre(artist.genres)
            }
            getArtistAlbums(db, artist.id);
        }
    });
}

function getArtistAlbums(db, id){
    console.log('https://api.spotify.com/v1/artists/'+id+'/albums');
    request({
        url: 'https://api.spotify.com/v1/artists/'+id+'/albums',
        method: 'GET',
        qs: {
            limit: 20,
            market: 'FR',
            include_groups: 'album' //not appears_on,compilation,single
        },
        headers: {
            'Authorization': 'Bearer '+db.access_token
        }
    }, function(err, res) {
        if (err) throw err;
        if (res.statusCode!=200){
            console.error("Error response code : " + res); return;
        }
        var albums = JSON.parse(res.body).items;
        var albums_ids = new Set();
        for (var i = 0; i < albums.length; i++) {
            albums_ids.add(albums[i].id)
        }
        withDelay(()=>{getAlbumsTracks(db, [...albums_ids].slice(0,19), id);})

    });
}

function getAlbumsTracks(db, ids, artist_id){
    console.log('https://api.spotify.com/v1/albums');
    request({
        url: 'https://api.spotify.com/v1/albums',
        method: 'GET',
        qs: {
            ids: ids.join(','),
            market: 'FR'
        },
        headers: {
            'Authorization': 'Bearer '+db.access_token
        }
    }, function(err, res) {
        if (err) throw err;
        if (res.statusCode!=200){
            console.error("Error response code : " + res); return;
        }
        var song_count = 0;
        var song_count_feat = 0;
        var artists_feat = new Set();

        var albums = JSON.parse(res.body).albums;
        for (var i = 0; i < albums.length; i++) {
            album = albums[i];
            for (var j = 0; j < album.tracks.items.length; j++) {
                track = album.tracks.items[j];
                song_count++;
                if(track.artists.length!=1)
                    song_count_feat++;
                for (var k = 0; k < track.artists.length; k++) {
                    artist = track.artists[k];
                    if(artist_id != artist.id){
                        artists_feat.add(artist.id);
                        if(db.graph.featurings[artist_id+"-"+artist.id])
                            db.graph.featurings[artist_id+"-"+artist.id]++;
                        else
                            db.graph.featurings[artist_id+"-"+artist.id] = 1;
                    }
                }
                db.graph.artists_infos[artist_id].song_count = song_count;
                db.graph.artists_infos[artist_id].feat_count = song_count_feat;
            }
        }
        prev_artists = new Set(db.graph.artists_ids);
        db.graph.artists_ids = [...new Set([...prev_artists, ...artists_feat])];
        writeDB(db_path, db);
    });
}

function analyzeGenre(genres){
    for (var i = 0; i < genres.length; i++) {
        if(regex.test(genres[i]))
            return true;
    }
    return false;
}

function withDelay(fun){
    setTimeout(fun, delay+=delay_step)
}

loadDB(db_path, (db) => {
    reloadToken(db, (db)=>{initGraph(db);})
})
