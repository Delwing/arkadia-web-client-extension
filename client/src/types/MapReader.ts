declare module "mudlet-map-renderer" {

    import Color = MapData.Color;
    import Room = MapData.Room;

    export class MapReader {

        roomIndex: Record<number, Room>

        constructor(data: MapData.Map, colors: Color[])

        getRoomById(id: number): Room;

        getPath(from: number, to: number): string[];

    }

}
