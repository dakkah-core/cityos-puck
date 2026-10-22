import { Puck, type Config, type Data } from "@cityos-core/puck";
import { Render } from "@cityos-core/puck/rsc";
import {
  CITYOS_PUCK_PACKAGE,
  bindCityOSPuckRegistration,
} from "@cityos-core/puck/cityos";
const config: Config = { components: {} };
const data: Data = { root: { props: {} }, content: [] };
void [
  Puck,
  Render,
  config,
  data,
  CITYOS_PUCK_PACKAGE,
  bindCityOSPuckRegistration,
];
