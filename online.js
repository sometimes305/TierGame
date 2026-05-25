(function () {
  const ROOM_TYPE = "aitools_tier_game_room";
  const PEER_PREFIX = "tier_sense_rt_";

  const online = {
    isGravity: window.self !== window.top,
    gravityRequests: {},
    gravityRoomRequests: {},
    gravityUserInfo: null,
    localPlayerName: "Player",
    localPlayerIcon: null,
    roomId: null,
    hostPeerId: null,
    peer: null,
    conn: null,
    conns: [],
    online: false,
    host: true,
    bound: false,

    isHost() {
      return this.online && this.host;
    },

    shouldSendAction() {
      return this.online && !this.host && this.conn && this.conn.open;
    },

    bindControls() {
      const nameInput = document.querySelector("#username");
      const createButton = document.querySelector("#createRoomButton");
      const refreshButton = document.querySelector("#refreshRoomsButton");
      const joinButton = document.querySelector("#joinRoomButton");

      if (nameInput && !nameInput.dataset.boundOnline) {
        nameInput.dataset.boundOnline = "1";
        nameInput.addEventListener("input", () => {
          this.localPlayerName = nameInput.value.trim() || "Player";
          window.TierGame.setPlayerName(this.localPlayerName, this.localPlayerIcon);
        });
      }
      if (createButton && !createButton.dataset.boundOnline) {
        createButton.dataset.boundOnline = "1";
        createButton.addEventListener("click", () => this.createRoom());
      }
      if (refreshButton && !refreshButton.dataset.boundOnline) {
        refreshButton.dataset.boundOnline = "1";
        refreshButton.addEventListener("click", () => this.fetchRoomList());
      }
      if (joinButton && !joinButton.dataset.boundOnline) {
        joinButton.dataset.boundOnline = "1";
        joinButton.addEventListener("click", () => {
          const input = document.querySelector("#joinRoomInput");
          this.joinRoom(input ? input.value.trim() : "");
        });
      }
      this.refreshProfile();
      this.refreshStatus();
    },

    refreshProfile() {
      const input = document.querySelector("#username");
      if (input && !input.value) input.value = this.localPlayerName;
      window.TierGame.setPlayerName((input && input.value.trim()) || this.localPlayerName, this.localPlayerIcon);
    },

    refreshStatus(text) {
      const el = document.querySelector("#onlineStatus");
      const badge = document.querySelector("#onlineBadge");
      let message = "";
      if (text) {
        message = text;
        if (el) el.textContent = message;
        if (badge) badge.textContent = message;
        return;
      }
      if (!this.online) {
        message = this.isGravity ? "Gravity: 未接続" : "オフライン";
      } else {
        message = `${this.host ? "ホスト" : "ゲスト"} / 部屋ID: ${String(this.roomId || "----").slice(-5)}`;
      }
      if (el) el.textContent = message;
      if (badge) badge.textContent = message;
    },

    makeHostPeerId(roomId) {
      let rid = String(roomId || "").replace(/[^a-zA-Z0-9_-]/g, "");
      if (!rid) rid = "room";
      return PEER_PREFIX + rid.slice(-24);
    },

    async parseData(data) {
      try {
        if (typeof Blob !== "undefined" && data instanceof Blob) data = await data.text();
        else if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) data = new TextDecoder().decode(new Uint8Array(data));
        if (typeof data === "string") data = JSON.parse(data);
        return data && typeof data === "object" ? data : null;
      } catch {
        return null;
      }
    },

    stopRealtime() {
      this.conns.forEach((conn) => {
        try {
          if (conn && conn.open) conn.close();
        } catch {}
      });
      this.conns = [];
      try {
        if (this.conn && this.conn.open) this.conn.close();
      } catch {}
      this.conn = null;
      try {
        if (this.peer) this.peer.destroy();
      } catch {}
      this.peer = null;
    },

    startHostPeer(roomId) {
      this.stopRealtime();
      this.hostPeerId = this.makeHostPeerId(roomId);
      if (!window.Peer) {
        this.refreshStatus("PeerJSを読み込めませんでした");
        return;
      }
      this.peer = new Peer(this.hostPeerId);
      this.peer.on("open", () => {
        this.refreshStatus();
        this.broadcastState(window.TierGame.exportState());
      });
      this.peer.on("connection", (conn) => {
        conn.on("data", async (raw) => {
          const msg = await this.parseData(raw);
          if (!msg) return;
          this.handleHostMessage(conn, msg);
        });
        conn.on("close", () => {
          this.conns = this.conns.filter((item) => item !== conn);
          this.refreshStatus(`${conn._playerName || "プレイヤー"}が退出しました`);
        });
        conn.on("error", () => {
          this.conns = this.conns.filter((item) => item !== conn);
        });
        this.conns.push(conn);
      });
      this.peer.on("error", (error) => {
        console.warn("[TierOnline] host peer error:", error);
        this.refreshStatus("Peer接続エラー");
      });
    },

    startGuestPeer(roomId) {
      this.stopRealtime();
      this.hostPeerId = this.makeHostPeerId(roomId);
      if (!window.Peer) {
        this.refreshStatus("PeerJSを読み込めませんでした");
        return;
      }
      this.peer = new Peer();
      this.peer.on("open", () => {
        const conn = this.peer.connect(this.hostPeerId);
        this.conn = conn;
        conn.on("open", () => {
          conn.send({
            type: "handshake",
            name: this.localPlayerName,
            icon: this.localPlayerIcon
          });
          this.refreshStatus();
        });
        conn.on("data", async (raw) => {
          const msg = await this.parseData(raw);
          if (!msg) return;
          this.handleGuestMessage(msg);
        });
        conn.on("close", () => this.refreshStatus("ホストとの接続が切れました"));
        conn.on("error", () => this.refreshStatus("ゲスト接続エラー"));
      });
      this.peer.on("error", (error) => {
        console.warn("[TierOnline] guest peer error:", error);
        this.refreshStatus("Peer接続エラー");
      });
    },

    handleHostMessage(conn, msg) {
      if (msg.type === "handshake") {
        conn._playerName = msg.name || "Player";
        conn.send({ type: "state", state: window.TierGame.exportState() });
        this.refreshStatus(`${conn._playerName}が入室しました`);
        return;
      }
      if (msg.type === "action") {
        window.TierGame.applyRemoteAction(msg.action);
      }
    },

    handleGuestMessage(msg) {
      if (msg.type === "state" || msg.type === "rt_sync") {
        window.TierGame.importState(msg.state || msg.data || msg);
      }
    },

    broadcastState(state) {
      if (!this.online || !this.host) return;
      this.conns.forEach((conn) => {
        if (!conn || !conn.open) return;
        try {
          conn.send({ type: "state", state });
        } catch {}
      });
    },

    sendAction(action) {
      if (!this.conn || !this.conn.open) {
        this.refreshStatus("ホストに未接続です");
        return;
      }
      this.conn.send({ type: "action", action });
    },

    async createRoom() {
      this.localPlayerName = window.TierGame.getPlayerName();
      this.host = true;
      this.online = true;
      this.refreshStatus("部屋を作成中...");
      try {
        if (this.isGravity) {
          const res = await this.callGravityRoomSDK("create_room", {
            room_type: ROOM_TYPE,
            max_players: 8,
            maxplayers: 8,
            room_permission: 0,
            permission: 0
          });
          const roomData = (res && res.data) || res || {};
          this.roomId = roomData.room_id || roomData.roomId || String(Math.floor(1000 + Math.random() * 9000));
        } else {
          this.roomId = String(Math.floor(1000 + Math.random() * 9000));
        }
        this.startHostPeer(this.roomId);
        this.refreshStatus();
      } catch (error) {
        console.warn("[TierOnline] create room failed:", error);
        this.online = false;
        this.refreshStatus("部屋作成に失敗しました");
      }
    },

    async joinRoom(roomId) {
      let rid = String(roomId || "").trim();
      if (!rid) {
        this.refreshStatus("部屋IDを入力してください");
        return;
      }
      this.localPlayerName = window.TierGame.getPlayerName();
      this.host = false;
      this.online = true;
      this.refreshStatus("入室中...");
      try {
        if (this.isGravity) {
          if (rid.length <= 10) rid = await this.findFullRoomId(rid);
          await this.callGravityRoomSDK("join_room", { room_id: rid });
        }
        this.roomId = rid;
        this.startGuestPeer(rid);
        this.refreshStatus();
      } catch (error) {
        console.warn("[TierOnline] join room failed:", error);
        this.online = false;
        this.refreshStatus("入室に失敗しました");
      }
    },

    async fetchRoomList() {
      const list = document.querySelector("#roomList");
      if (!list) return;
      list.innerHTML = '<div class="room-list-loading">読み込み中...</div>';
      if (!this.isGravity) {
        list.innerHTML = '<div class="room-list-empty">Gravity外では公開ルーム一覧を取得できません。部屋IDで入室してください。</div>';
        return;
      }
      try {
        const rooms = await this.getPublicRooms();
        if (!rooms.length) {
          list.innerHTML = '<div class="room-list-empty">現在公開中の部屋はありません。</div>';
          return;
        }
        list.innerHTML = "";
        rooms.forEach((room) => {
          const roomId = String(room.room_id || room.roomId || room.id || "");
          const count = room.gamer_num || room.current_players || room.player_count || room.online_users || room.user_count || 0;
          const max = room.max_players || room.max_user_count || 8;
          const card = document.createElement("div");
          card.className = "room-card";
          card.innerHTML = `
            <div>
              <div class="room-title">部屋ID: ${roomId.slice(-5)}</div>
              <div class="room-meta">${count}/${max}人</div>
            </div>
          `;
          const join = document.createElement("button");
          join.type = "button";
          join.textContent = "入室";
          join.addEventListener("click", () => this.joinRoom(roomId));
          card.append(join);
          list.append(card);
        });
      } catch (error) {
        console.warn("[TierOnline] fetch rooms failed:", error);
        list.innerHTML = '<div class="room-list-empty">ルーム情報の取得に失敗しました。</div>';
      }
    },

    async getPublicRooms() {
      const res = await this.callGravityRoomSDK("get_public_rooms", {
        room_type: ROOM_TYPE,
        page_num: 1,
        page_size: 20
      });
      let rooms = [];
      if (res) {
        if (res.data && res.data.list) rooms = res.data.list;
        else if (res.data && Array.isArray(res.data)) rooms = res.data;
        else if (res.list) rooms = res.list;
        else if (res.rooms) rooms = res.rooms;
        else if (Array.isArray(res)) rooms = res;
      }
      const now = Date.now();
      const tenMinutes = 10 * 60 * 1000;
      return rooms.filter((room) => {
        const ts = room.create_time || room.created_at || room.createTime || room.createdAt;
        if (!ts) return true;
        let date = new Date(ts);
        if (date.getFullYear() < 2000) date = new Date(ts * 1000);
        if (Number.isNaN(date.getTime())) return true;
        return now - date.getTime() < tenMinutes;
      });
    },

    async findFullRoomId(shortId) {
      const rooms = await this.getPublicRooms();
      const found = rooms.find((room) => String(room.room_id || room.roomId || room.id || "").endsWith(shortId));
      if (!found) throw new Error("部屋が見つかりません");
      return String(found.room_id || found.roomId || found.id || "");
    },

    callGravitySDK(action, params) {
      if (!this.isGravity) return Promise.reject("Not in Gravity environment");
      return new Promise((resolve, reject) => {
        const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        this.gravityRequests[requestId] = { resolve, reject };
        window.top.postMessage({
          type: "API",
          action,
          requestId,
          params: params || {}
        }, "*");
      });
    },

    callGravityRoomSDK(action, params) {
      if (!this.isGravity) return Promise.reject("Not in Gravity environment");
      return new Promise((resolve, reject) => {
        const requestId = `${action}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        this.gravityRoomRequests[requestId] = { resolve, reject };
        const message = { action, actionId: requestId, actionld: requestId };
        if (params) Object.assign(message, params);
        window.parent.postMessage(message, "*");
      });
    },

    async initGravityUser() {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlName = params.get("username");
        const rawIcon = params.get("portrait") || params.get("avatar") || params.get("icon") || params.get("head_img") || params.get("headimgurl");
        const autoRoomId = params.get("room_id") || params.get("roomid");
        if (autoRoomId) setTimeout(() => this.joinRoom(autoRoomId), 300);
        if (urlName) {
          this.localPlayerName = urlName;
          this.localPlayerIcon = rawIcon ? decodeURIComponent(rawIcon) : null;
          window.TierGame.setPlayerName(this.localPlayerName, this.localPlayerIcon);
          return;
        }
      } catch {}

      if (!this.isGravity) {
        window.TierGame.setPlayerName(this.localPlayerName, this.localPlayerIcon);
        return;
      }

      try {
        const user = await this.callGravitySDK("AgentSDK.user.getMyUserInfo");
        if (user && (user.name || user.nickname || user.user_name)) {
          this.gravityUserInfo = user;
          this.localPlayerName = user.name || user.nickname || user.user_name;
          this.localPlayerIcon = user.portrait || user.avatar || user.icon || user.head_img || user.headimgurl || user.profile_image || null;
          window.TierGame.setPlayerName(this.localPlayerName, this.localPlayerIcon);
        }
      } catch (error) {
        console.warn("[TierOnline] Gravity user load failed:", error);
      }
    }
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "API_CALLBACK" && data.requestId) {
      const req = online.gravityRequests[data.requestId];
      if (!req) return;
      if (data.error) req.reject(data.error);
      else req.resolve(data.payload);
      delete online.gravityRequests[data.requestId];
      return;
    }

    const responseId = data.actionId || data.actionld;
    if ((data.type === "gravityroomresponse" || data.type === "gravity_room_response") && responseId) {
      const req = online.gravityRoomRequests[responseId];
      if (!req) return;
      const result = data.result || {};
      if (result.errno !== undefined && result.errno !== 0) {
        req.reject(`SDK Error (errno:${result.errno}): ${result.errmsg || "Unknown"}`);
      } else {
        req.resolve(result);
      }
      delete online.gravityRoomRequests[responseId];
    }
  });

  window.TierOnline = online;
  online.bindControls();
  online.initGravityUser();
})();
