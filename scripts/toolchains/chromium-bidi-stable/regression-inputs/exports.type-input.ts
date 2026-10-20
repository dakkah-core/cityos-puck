// Parent supplies a temporary compiler project and resolves chromium-bidi to the
// rebuilt candidate. This input is not added to a workspace or compiler project.
import {BidiMapper, Protocol} from 'chromium-bidi';

const createAndStart: typeof BidiMapper.BidiServer.createAndStart =
  BidiMapper.BidiServer.createAndStart;
const media: Protocol.Emulation.SetMediaFeaturesOverrideParameters = {
  features: {'prefers-color-scheme': 'dark'}, contexts: ['page-a'],
};
const viewport: Protocol.Emulation.SetViewportMetaOverrideParameters = {
  viewportMeta: true, userContexts: ['default'],
};
const mediaCommand: Protocol.Command = {
  id: 1, method: 'emulation.setMediaFeaturesOverride', params: media,
};
const viewportCommand: Protocol.Command = {
  id: 2, method: 'emulation.setViewportMetaOverride', params: viewport,
};
type PreservedInterfaces = [BidiMapper.CdpClient, BidiMapper.CdpConnection,
  BidiMapper.BidiTransport, Protocol.Cdp.SendCommandParameters,
  Protocol.Cdp.GetSessionParameters, Protocol.Cdp.ResolveRealmParameters];

export {createAndStart, mediaCommand, viewportCommand};
export type {PreservedInterfaces};
