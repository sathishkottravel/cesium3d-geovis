import { Ion } from "cesium";
import { appConfig } from "../../config/appConfig";

// Shared by every Viewer; imported for its side effect.
if (appConfig.cesiumIonToken) {
  Ion.defaultAccessToken = appConfig.cesiumIonToken;
}
