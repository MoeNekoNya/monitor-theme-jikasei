import test from "node:test";
import assert from "node:assert/strict";
import {isOnline,parseGpuInfo,probeValueState,mergeIncremental,hasDiskIo,formatRate,sparklinePoints} from "../src/lib/metrics.js";

test("online threshold is five minutes",()=>{
 const now=1800000000000;
 assert.equal(isOnline({last_updated:now-299999},now),true);
 assert.equal(isOnline({last_updated:now-300000},now),false);
});
test("GPU accepts arrays and history JSON strings",()=>{
 const rows=[{id:"0",name:"GPU",info:10}];
 assert.deepEqual(parseGpuInfo(rows),rows);
 assert.deepEqual(parseGpuInfo(JSON.stringify(rows)),rows);
 assert.deepEqual(parseGpuInfo("{broken"),[]);
});
test("probe tri-state keeps 0 and treats null as timeout",()=>{
 assert.equal(probeValueState(false),"hidden");
 assert.equal(probeValueState(undefined),"hidden");
 assert.equal(probeValueState(null),"timeout");
 assert.equal(probeValueState(0),"value");
});
test("incremental samples preserve absent metrics",()=>{
 const result=mergeIncremental({cpu:5,ram_used:3000},{cpu:9},1000);
 assert.equal(result.cpu,9);assert.equal(result.ram_used,3000);assert.equal(result.last_updated,1000);
});
test("missing or zero-only disk IO is hidden",()=>{
 assert.equal(hasDiskIo(undefined),false);assert.equal(hasDiskIo({read_bps:0,write_bps:0}),false);assert.equal(hasDiskIo({read_bps:1}),true);
});
test("traffic rates are bytes per second",()=>{
 assert.equal(formatRate(1024),"1.0 KB/s");assert.equal(formatRate(1048576),"1.00 MB/s");
});
test("zero is chartable while timeout and false samples are omitted",()=>{
 const points=sparklinePoints([{ct:null},{ct:false},{ct:0},{ct:5}],"ct");
 assert.ok(points.includes("0.0,"));
});