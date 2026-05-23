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

const DEFAULT_BROKER = "wss://1303127e3fac47ce811384c183c0f735.s1.eu.hivemq.cloud:8884/mqtt";
const BROKER_STORAGE_KEY = "mqtt_broker";

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

const DEFAULT_USERNAME = "keinarra";
const DEFAULT_PASSWORD = "Keinarra123";

export function useMQTT() {
  const [connected, setConnected] = useState(persistentConnected);
  const [broker, setBroker] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_BROKER;
    try { return localStorage.getItem(BROKER_STORAGE_KEY) ?? DEFAULT_BROKER; } catch { return DEFAULT_BROKER; }
  });
  const [mqttUser, setMqttUser] = useState(DEFAULT_USERNAME);
  const [mqttPass, setMqttPass] = useState(DEFAULT_PASSWORD);
  const callbacksRef = useRef(persistentCallbacks);

  useEffect(() => {
    callbacksRef.current = persistentCallbacks;
  });

  useEffect(() => {
    try { localStorage.setItem(BROKER_STORAGE_KEY, broker); } catch {}
  }, [broker]);

  const connect = useCallback((url?: string, username?: string, password?: string) => {
    const u = (url || broker).trim();
    if (!u) return;
    if (persistentClient && persistentConnected) return;

    persistentUrl = u;
    if (persistentClient) {
      persistentClient.end(true);
      persistentClient = null;
    }

    const client = mqtt.connect(u, {
      username: username || mqttUser,
      password: password || mqttPass,
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
    mqttUser,
    setMqttUser,
    mqttPass,
    setMqttPass,
    connect,
    disconnect,
    publish,
    sendMotors,
    sendBuzzer,
    setCallbacks,
    topics: TOPICS,
  };
}
