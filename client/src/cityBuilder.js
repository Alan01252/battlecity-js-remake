import {CAN_BUILD} from "./constants";
import {CANT_BUILD} from "./constants";
import {MAP_SQUARE_BUILDING} from "./constants";

var city = {
    canBuild: {

        CAN_BUILD_HOUSE: CAN_BUILD,

        CAN_BUILD_LASER_RESEARCH: CAN_BUILD,
        CAN_BUILD_TURRET_RESEARCH: CAN_BUILD,
        CAN_BUILD_BOMB_RESEARCH: CANT_BUILD,
        CAN_BUILD_MEDKIT_RESEARCH: CANT_BUILD,
        CAN_BUILD_MINE_RESEARCH: CANT_BUILD,
        CAN_BUILD_ORB_RESEARCH: CANT_BUILD,
        CAN_BUILD_COUGAR_RESEARCH: CANT_BUILD,

        CAN_BUILD_LASER_FACTORY: CANT_BUILD,
        CAN_BUILD_TURRET_FACTORY: CANT_BUILD,
        CAN_BUILD_BOMB_FACTORY: CANT_BUILD,
        CAN_BUILD_MEDKIT_FACTORY: CANT_BUILD,
        CAN_BUILD_MINE_FACTORY: CANT_BUILD,
        CAN_BUILD_ORB_FACTORY: CANT_BUILD,
        CAN_BUILD_COUGAR_FACTORY: CANT_BUILD,


    }
};

function createFakeCity(game) {
    /*
    var cityData = PIXI.loader.resources["data/cities/7/demo.city"].data;
    console.log(cityData);
    var lines = cityData.split('\n');
    console.log(lines);
    for(var i = 0;i < lines.length;i++){
        //code here using lines[i] which will give you each line
        var data = lines[i].split(" ");
        game.buildingFactory.newBuilding(null, data[1], data[2], data[0])

        console.log(data[0]);
        try {
            game.tiles[data[1]][data[2]] = data[0];
            game.map[data[1]][data[2]] = MAP_SQUARE_BUILDING;
        }catch (e) {

        }

        console.log(data[1] * 48);
        console.log(data[2] * 48);
    }
    */

}

function createCities(game) {
    for (var j = 0; j < game.map.length; j++) {
        for (var i = 0; i < game.map.length; i++) {
            if ((game.map[i][j] == MAP_SQUARE_BUILDING)) {
                var newCity = JSON.parse(JSON.stringify(city));
                newCity.id = i;
                newCity.x = i * 48;
                newCity.y = j * 48;
                game.cities.push(newCity);
            }
        }
    }
}

export const build = (game) => {
    createCities(game);
    createFakeCity(game);
};
