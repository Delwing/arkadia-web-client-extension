// Mock for mudlet-map-renderer to avoid Konva ES module issues in tests

class MapReader {
  constructor() {}

  getRoomById() {
    return null;
  }

  getRoomsByArea() {
    return [];
  }
}

class PathFinder {
  constructor() {}

  findPath() {
    return [];
  }
}

module.exports = {
  MapReader,
  PathFinder,
};
