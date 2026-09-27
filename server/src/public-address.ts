import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions } from "node:dns";
import { Agent } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/**
 * Addresses the server must never connect to on somebody else's say-so.
 *
 * A push endpoint is a URL a user hands over, and the reminder sweep connects to it from
 * inside the server's network. Checking how the host name is spelled is not enough: any
 * public name can resolve to 169.254.169.254, to 127.0.0.1, or to a database on the same
 * network. So the check is on the address, and it is made by the connection's own lookup —
 * the one it then connects to — which a name that changes its answer between a check and a
 * connection (DNS rebinding) cannot get around.
 */
const PRIVATE = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, where cloud metadata services live
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and the broadcast address
] as const) {
  PRIVATE.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64, which reaches IPv4 inside
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  PRIVATE.addSubnet(network, prefix, "ipv6");
}

/** An IPv4 address written as IPv6 (`::ffff:10.0.0.1`) is judged as the IPv4 it is. */
function asIpv4(address: string): string | null {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);

  return mapped ? mapped[1] : null;
}

export function isPublicAddress(address: string): boolean {
  const ipv4 = isIP(address) === 4 ? address : asIpv4(address);

  if (ipv4) {
    return !PRIVATE.check(ipv4, "ipv4");
  }

  return isIP(address) === 6 && !PRIVATE.check(address, "ipv6");
}

/** The error a refused address surfaces as, so a caller can tell it from a network fault. */
export const NOT_PUBLIC = "ENOTPUBLIC";

function notPublic(hostname: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(
    `${hostname} resolves to an address this server will not connect to`,
  );
  error.code = NOT_PUBLIC;

  return error;
}

/** A name to every address it has: `dns.lookup` with `all`, or a stand-in for one. */
export type Resolve = (
  hostname: string,
  options: LookupAllOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

const resolveAll: Resolve = (hostname, options, callback) => {
  dnsLookup(hostname, options, callback);
};

/**
 * A `lookup` for sockets that resolves as usual and refuses the answer if any address in it
 * is not public. Every address is checked, not only the first: a connection may fall back
 * to the next one.
 */
export function publicOnlyLookup(resolve: Resolve = resolveAll): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { ...options, all: true }, (error, all) => {
      if (error) {
        callback(error, "", 0);
        return;
      }

      if (!all.length || all.some((entry) => !isPublicAddress(entry.address))) {
        callback(notPublic(hostname), "", 0);
        return;
      }

      if (options.all) {
        callback(null, all);
        return;
      }

      callback(null, all[0].address, all[0].family);
    });
  };
}

/** What every push is sent through. */
export const publicOnlyAgent = new Agent({ lookup: publicOnlyLookup() });
