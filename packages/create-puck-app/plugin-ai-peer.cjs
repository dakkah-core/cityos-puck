// Shared by the workspace resolver and standalone AI recipe bootstraps.
function retargetPluginAiPeer(pkg, contract) {
  if (pkg.name !== contract.upstreamPackage || pkg.version !== contract.upstreamVersion) return pkg;
  const peers = pkg.peerDependencies ?? {};
  if (peers["@puckeditor/core"] === undefined && peers[contract.corePackage] === contract.coreSourceVersion) return pkg;
  if (peers["@puckeditor/core"] !== contract.upstreamCorePeer || peers[contract.corePackage] !== undefined) {
    throw new Error(`Unexpected ${pkg.name}@${pkg.version} core peer contract`);
  }
  const nextPeers = { ...peers, [contract.corePackage]: contract.coreSourceVersion };
  delete nextPeers["@puckeditor/core"];
  return { ...pkg, peerDependencies: nextPeers };
}

module.exports = { retargetPluginAiPeer };
