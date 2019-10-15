
const rp = require('request-promise');
const fs = require('fs');
const express = require('express')
const path = require('path')
const util = require('util');
const app = express();

var db, token;

const db_path = 'french_rap.json';
const regex = /.*((franc|french|belg|franç)+.*(rap|hip hop)+)|((rap|hip hop)+.*(franc|french|belg|franç)+).*/;
const delay_step = 1000;


function loadDB(path){
    return new Promise(function(resolve, reject){
        fs.readFile(path, 'utf8', (err, data) => {
            if (err){
                if(err.code=='ENOENT'){
                    console.log(path+' created!');
                    data = JSON.stringify({});
                } else {
                    reject(err);
                }
            }
            console.log(path+' opened!');
            resolve(JSON.parse(data));
        });
    });
}

function writeDB(path, db){
    return new Promise(function(resolve, reject){
        fs.writeFile(path, JSON.stringify(db, null, 2), 'utf8', (err) => {
            if (err) reject(err);
            console.log(path+' saved!');
            resolve(db);
        });
    });
}

function reloadToken(){
    return rp({
        url: 'https://accounts.spotify.com/api/token',
        method: 'POST',
        form: {
            'grant_type': 'client_credentials',
            'client_id': "81e657278a2742739d2020bc48963bf5",
            'client_secret': "713df9a23eef4999aa75c2515b937b5f"
        },
        transform: (body) => {
            console.log("New token !");
            return JSON.parse(body).access_token;
        }
    }).catch(err => {
        console.error(err);
    });
}

function initGraph(db){
    if(!db.artists || !db.featurings)
        db = {artists: {"6qFt3TjvxMt77YGsktWG8Z": {"name": "Sofiane","popularity": 75,"genre_ok": true,"song_count": 0,"feat_count": 0, "explored": false}}, featurings: {}};
    return db;
}

function getArtistInfos(ids, token){
    return rp({
        url: 'https://api.spotify.com/v1/artists',
        method: 'GET',
        qs: {ids: ids.join(',')},
        headers: {
            'Authorization': 'Bearer '+token
        },
        transform: (data) => {
            return JSON.parse(data).artists;
        }
    }).catch(err => {
        console.error(err);
    });
}

function getArtistAlbums(id, token){
    return rp({
        url: 'https://api.spotify.com/v1/artists/'+id+'/albums',
        method: 'GET',
        qs: {
            limit: 50,
            market: 'FR',
            include_groups: 'album' //not appears_on,compilation,single
        },
        headers: {
            'Authorization': 'Bearer '+token
        },
        transform: (data) => {
            return JSON.parse(data).items;
        }
    }).catch(err => {
        console.error(err);
    });
}

function getAlbumsTracks(ids, token){
    return rp({
        url: 'https://api.spotify.com/v1/albums',
        method: 'GET',
        qs: {
            limit: 50,
            ids: ids.join(','),
            market: 'FR'
        },
        headers: {
            'Authorization': 'Bearer '+token
        },
        transform: (data) => {
            return JSON.parse(data).albums;
        }
    }).catch(err => {
        console.error(err);
    });
}

function analyzeGenre(genres){
    for (var i = 0; i < genres.length; i++) {
        if(regex.test(genres[i]))
            return true;
    }
    return false;
}

function addFeaturing(db, a, b){
    if(a < b)
        [a, b] = [b, a]
    if(db.featurings[a+"-"+b])
        db.featurings[a+"-"+b]++;
    else
        db.featurings[a+"-"+b] = 1;
}

function delayPromise(ms, message = "") {
  return function(x) {
    return new Promise(resolve => setTimeout(() => {console.log(message);resolve(x)}, ms));
  };
}

function step(path){
    return loadDB(path).then(database => {
        db = initGraph(database);
        return reloadToken();
    }).then(t =>{
        token = t;
        var p_artists = [], delay = 0;
        for (var [k, v] of Object.entries(db.artists)){
            if(!v.explored && v.genre_ok){
                v.explored = true;
                p_artists.push(getArtistAlbums(k, token).then(delayPromise(delay+=delay_step, "get artist "+v.name+" albums")));
            }
        }
        return Promise.all(p_artists);
    }).then(groups => {
        var keys = [], p_albums = [], delay = 0;
        for (var i = 0; i < groups.length; i++) {
            for (var j = 0; j < groups[i].length; j++) {
                keys.push(groups[i][j].id);
            }
        }
        for (var i = 0; i < keys.length; i+=20) {
            p_albums.push(getAlbumsTracks(keys.slice(i, i+20), token).then(delayPromise(delay+=delay_step, "get albums tracks")));
        }
        return Promise.all(p_albums);
    }).then(albums => {
        var new_artists = [], p_new_artists = [], delay = 0;
        for (var i = 0; i < albums.length; i++) {
            for (var j = 0; j < albums[i].length; j++) {
                for (var t = 0; t < albums[i][j].tracks.items.length; t++) {
                    var track = albums[i][j].tracks.items[t];
                    var author = track.artists[0].id;
                    var feat = false;
                    for (var f = track.artists.length-1; f >= 0; f--){
                        var featured = track.artists[f].id;
                        if(f>0){
                            feat = true;
                            addFeaturing(db, author, featured);
                        }
                        if(!db.artists[featured]){
                            db.artists[featured] = {"song_count": 0, "feat_count": 0 , "explored": false}
                            new_artists.push(featured);
                        }
                        db.artists[featured].song_count++;
                        db.artists[featured].feat_count+=feat;
                    }
                }
            }
        }
        for (var i = 0; i < new_artists.length; i+=20) {
            p_new_artists.push(getArtistInfos(new_artists.slice(i, i+20), token).then(delayPromise(delay+=delay_step, "get artists infos")));
        }
        return Promise.all(p_new_artists);
    }).then(artists => {
        for (var i = 0; i < artists.length; i++) {
            for (var j = 0; j < artists[i].length; j++) {
                var artist = artists[i][j];
                db.artists[artist.id].name = artist.name;
                db.artists[artist.id].popularity = artist.popularity;
                db.artists[artist.id].genre_ok = analyzeGenre(artist.genres);
            }
        }
        return writeDB(path, db);
    })
}


app.use(express.static('public'));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, './public', 'visu.html'));
})

app.post('/graphstep', function (req, res) {
    step(db_path).then((data)=>{
        res.send(JSON.stringify(data));
    });
});

app.get('/graph', function (req, res) {
    fs.readFile(db_path, 'utf8', (err, data) => {
        var o = {nodes: [], links: []};
        var g = JSON.parse(data);
        if (err) console.error(err);

        if (Object.entries(g).length>=2){
            for (var [k, v] of Object.entries(g.artists)) {
                v.id = k;
                o.nodes.push(v);
            }
            for (var [k, v] of Object.entries(g.featurings)) {
                var ids = k.split("-");
                var link = {source: ids[0], target: ids[1], weight: v}
                o.links.push(link);
            }
        }

        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(o));
    });
});

app.listen(3000, function () {
  console.log('Graph - localhost:3000')
});
