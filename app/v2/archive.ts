// Archival footage for the hall: public-domain U.S. government films and newsreels (FedFlix, via destockd.com),
// hand-picked by Randall. Each clip is a 4:3 black-and-white excerpt (640x480, 24 fps, at most 6 s, silent).
// Sources and in-points: public/archive/SOURCES.json.
// `src` has no extension: each clip ships as .webm (VP9) and .mp4 (H.264), and the browser gets what it plays.
export type Clip={src:string;w:number;h:number;dur:number;subject:string};
export const clips:Clip[]=[
 {src:"/archive/archive-01",w:640,h:480,dur:3.6,subject:"AMERICAN ARMY WOMEN SERVING ON ALL FRONTS"},
 {src:"/archive/archive-03",w:640,h:480,dur:6,subject:"December 7th (Long Version)"},
 {src:"/archive/archive-04",w:640,h:480,dur:2.7,subject:"German Soldiers and Scientists Conduct Research and Development of Various Types of Missiles and Rockets, Including the"},
 {src:"/archive/archive-05",w:640,h:480,dur:2.9,subject:"HEAVY MORTAR PLATOON, INCHON, KOREA"},
 {src:"/archive/archive-06",w:640,h:480,dur:2.6,subject:"KNOW YOUR ENEMY; JAPAN"},
 {src:"/archive/archive-07",w:640,h:480,dur:6,subject:"LIBRARY STOCK SHOT #1369"},
 {src:"/archive/archive-08",w:640,h:480,dur:1.9,subject:"LIBRARY STOCK SHOT #1710"},
 {src:"/archive/archive-09",w:640,h:480,dur:6,subject:"LIBRARY STOCK SHOT #738"},
 {src:"/archive/archive-10",w:640,h:480,dur:3,subject:"Lady Marines"},
 {src:"/archive/archive-11",w:640,h:480,dur:2.7,subject:"MACARTHUR RETURNS TO THE PHILIPPINES"},
 {src:"/archive/archive-12",w:640,h:480,dur:4.3,subject:"NEGRO EDUCATION FOR AMERICAN LIVING; CALHOUN SCHOOL, THE WAY TO A BETTER FUTURE"},
 {src:"/archive/archive-13",w:640,h:480,dur:6,subject:"NEGRO NOTABLES; NEGRO EDUCATION AND ART IN THE U.S"},
 {src:"/archive/archive-14",w:640,h:480,dur:4.1,subject:"NEGRO NOTABLES; NEGRO EDUCATION AND ART IN THE U.S"},
 {src:"/archive/archive-15",w:640,h:480,dur:6,subject:"OPERATIONS CROSSROADS, ATOM BOMB TEST, BIKINI ATOLL"},
 {src:"/archive/archive-16",w:640,h:480,dur:5,subject:"The President Accounts"},
 {src:"/archive/archive-17",w:640,h:480,dur:2.4,subject:"Universal Newsreel Volume 18, Release 363"},
 {src:"/archive/archive-18",w:640,h:480,dur:3.7,subject:"Universal Newsreel Volume 21, Release 161"},
 {src:"/archive/archive-19",w:640,h:480,dur:6,subject:"Universal Newsreel Volume 31, Release 25"},
 {src:"/archive/archive-20",w:640,h:480,dur:3.8,subject:"Universal Newsreel Volume 36, Release 28"},
 {src:"/archive/archive-21",w:640,h:480,dur:1.9,subject:"Universal Newsreel Volume 36, Release 32"},
 {src:"/archive/archive-22",w:640,h:480,dur:1.9,subject:"Universal Newsreel Volume 38, Release 29"},
 {src:"/archive/archive-23",w:640,h:480,dur:2.8,subject:"Universal Newsreel Volume 38, Release 29"},
 {src:"/archive/archive-24",w:640,h:480,dur:3.4,subject:"Universal Newsreel Volume 38, Release 29"},
 {src:"/archive/archive-25",w:640,h:480,dur:1.8,subject:"WAR CRIMES TRIALS, TOKYO, JAPAN 41"},
];

