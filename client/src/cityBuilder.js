import {DEFAULT_CITY_CAN_BUILD} from "./constants";
import {MONEY_STARTING_VALUE} from "./constants";
import citySpawns from '@shared/citySpawns.json';
import {getCityDisplayName, getCitySpawn} from "./utils/citySpawns";

const createDefaultCanBuild = () => ({ ...DEFAULT_CITY_CAN_BUILD });

const createCityTemplate = () => ({
    canBuild: createDefaultCanBuild(),
    cash: MONEY_STARTING_VALUE,
    income: 0,
    itemProduction: 0,
    research: 0,
    hospital: 0,
    construction: 0,
    grossIncome: 0,
});

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
    game.cities = [];
    Object.keys(citySpawns || {}).forEach((key) => {
        const numericId = Number(key);
        if (!Number.isFinite(numericId)) {
            return;
        }
        const entry = citySpawns[key];
        const spawn = getCitySpawn(numericId);
        const newCity = createCityTemplate();
        newCity.id = numericId;
        const tileX = Number(entry?.tileX);
        const tileY = Number(entry?.tileY);
        const resolvedTileX = Number.isFinite(tileX) ? tileX : (spawn?.tileX ?? 0);
        const resolvedTileY = Number.isFinite(tileY) ? tileY : (spawn?.tileY ?? 0);
        newCity.tileX = resolvedTileX;
        newCity.tileY = resolvedTileY;
        newCity.x = resolvedTileX * 48;
        newCity.y = resolvedTileY * 48;
        newCity.name = getCityDisplayName(numericId);
        game.cities[numericId] = newCity;
    });
}

export const build = (game) => {
    createCities(game);
    createFakeCity(game);
};
