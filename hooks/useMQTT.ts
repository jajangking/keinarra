"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import mqtt from "mqtt";

type MqttOptions = {
  url: string;
  onMessage?: (topic: string, payload: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectPeriod?: number;
};

const TOPICS = {
  motor: "keinarra/esp32/motor",
  buzzer: "keinarra/esp32/buzzer",
  status: "keinarra/esp32/status",
};

let persistentClient: mqtt.MqttClient | null = null;
let persistentConnected = false;
let persistentUrl = "";
let persistentCallbacks: {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (topic: string, payload: string) => void;
} = {};

export function useMQTT() {
  const [connected, setConnected] = useState(persistentConnected);
  const [broker, setBroker] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("mqtt_broker") ?? ""; } catch { return ""; }
  });
  const callbacksRef = useRef(persistentCallbacks);

  useEffect(() => {
    callbacksRef.current = persistentCallbacks;
  });

  useEffect(() => {
    try { localStorage.setItem("mqtt_broker", broker); } catch {}
  }, [broker]);

  const connect = useCallback((url?: string) => {
    const u = (url || broker).trim();
    if (!u) return;
    if (persistentClient && persistentConnected) return;

    persistentUrl = u;
    if (persistentClient) {
      persistentClient.end(true);
      persistentClient = null;
    }

    const client = mqtt.connect(u, {
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clean: true,
    });

    persistentClient = client;

    client.on("connect", () => {
      persistentConnected = true;
      setConnected(true);
      client.subscribe(TOPICS.status, { qos: 0 });
      persistentCallbacks.onConnect?.();
    });

    client.on("message", (topic, payload) => {
      persistentCallbacks.onMessage?.(topic, payload.toString());
    });

    client.on("close", () => {
      persistentConnected = false;
      setConnected(false);
      persistentCallbacks.onDisconnect?.();
    });

    client.on("offline", () => {
      persistentConnected = false;
      setConnected(false);
    });
  }, [broker]);

  const disconnect = useCallback(() => {
    if (persistentClient) {
      persistentClient.end(true);
      persistentClient = null;
    }
    persistentConnected = false;
    setConnected(false);
  }, []);

  const publish = useCallback((topic: string, payload: string, qos: 0 | 1 | 2 = 0) => {
    if (persistentClient && persistentConnected) {
      persistentClient.publish(topic, payload, { qos });
    }
  }, []);

  const sendMotors = useCallback((left: number, right: number) => {
    publish(TOPICS.motor, JSON.stringify({ left, right }));
  }, [publish]);

  const sendBuzzer = useCallback((pattern: string) => {
    publish(TOPICS.buzzer, pattern);
  }, [publish]);

  const setCallbacks = useCallback((cbs: typeof persistentCallbacks) => {
    persistentCallbacks = cbs;
  }, []);

  return {
    connected,
    broker,
    setBroker,
    connect,
    disconnect,
    publish,
    sendMotors,
    sendBuzzer,
    setCallbacks,
    topics: TOPICS,
  };
}
