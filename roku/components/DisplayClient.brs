sub init()
    m.port = CreateObject("roMessagePort")
    m.ws = invalid
    m.registerReq = invalid
    m.backoffS = 0
    m.retryTimer = invalid
    m.running = false

    appInfo = CreateObject("roAppInfo")
    m.appVersion = appInfo.GetVersion()
    device = CreateObject("roDeviceInfo")
    m.osVersion = ""
    if device <> invalid
        ver = device.GetVersion()
        if ver <> invalid then m.osVersion = ver
    end if

    m.top.observeField("control", "onControl")
end sub

sub onControl()
    if m.top.control = "RUN"
        m.running = true
        m.connect()
    else if m.top.control = "STOP"
        m.running = false
        m.teardown()
    end if
end sub

sub teardown()
    if m.retryTimer <> invalid
        m.retryTimer = invalid
    end if
    if m.ws <> invalid
        m.ws.Close()
        m.ws = invalid
    end if
    m.top.status = "connecting"
end sub

sub connect()
    if not m.running then return
    m.backoffS = 0
    m.top.status = "connecting"
    m.register()
end sub

sub register()
    if not m.running then return
    m.top.status = "registering"
    base = m.top.backend
    if Right(base, 1) <> "/" then base = base + "/"

    req = CreateObject("roUrlTransfer")
    req.SetUrl(base + "api/displays/register")
    req.AddHeader("Content-Type", "application/json")
    req.SetMessagePort(m.port)
    req.SetRequest("POST")
    body = FormatJson({
        code: m.top.code
        token: m.top.token
        software: "checador-roku " + m.appVersion
        os_version: m.osVersion
    })
    m.registerReq = req
    posted = req.AsyncPostFromString(body)
    if not posted then
        m.registerReq = invalid
        return m.scheduleReconnect()
    end if

    msg = m.port.WaitMessage(8000)
    if msg = invalid then
        m.registerReq = invalid
        return m.scheduleReconnect()
    end if
    if type(msg) <> "roUrlEvent" then
        return m.scheduleReconnect()
    end if

    code = msg.GetResponseCode()
    if code <> 200 then
        m.registerReq = invalid
        return m.scheduleReconnect()
    end if

    data = ParseJson(msg.GetString())
    m.registerReq = invalid
    if data = invalid or data.ok <> true or data.wsUrl = invalid then
        return m.scheduleReconnect()
    end if

    m.top.wsUrl = data.wsUrl
    m.openSocket()
end sub

sub openSocket()
    if not m.running then return
    if m.top.wsUrl = "" then return m.scheduleReconnect()

    ws = CreateObject("roWebSocket")
    if ws = invalid then return m.scheduleReconnect()
    ws.SetUrl(m.top.wsUrl)
    ws.SetHeaders({
        "Authorization": "Bearer " + m.top.token
        "X-Display-Code": m.top.code
        "Origin": m.top.backend
    })
    ws.SetMessagePort(m.port)
    ws.SetAutoPingReply(true)
    m.ws = ws

    if not ws.Open() then
        m.ws = invalid
        return m.scheduleReconnect()
    end if
    m.waitForEvents()
end sub

sub waitForEvents()
    while m.running
        msg = m.port.WaitMessage(0)
        token = type(msg)
        if token = "roWebSocketEvent"
            m.handleWsEvent(msg)
        else if token = "roUrlEvent"
            m.handleRegisterEvent(msg)
        else if token = "roTimerEvent"
            m.handleRetryEvent(msg)
        end if
    end while
end sub

sub handleWsEvent(msg as Object)
    t = msg.GetType()
    if t = 1 ' Opened
        m.backoffS = 0
        m.top.status = "online"
        m.sendMeta()
    else if t = 5 ' TextReceived
        info = msg.GetInfo()
        if info <> invalid and info.Text <> invalid then
            m.top.payload = info.Text
        end if
    else if t = 7 ' PingReceived -> el servidor responde automático (SetAutoPingReply), no hacer nada
        ' no-op
    else if t = 2 or t = 3 ' Closed / Error
        wasAuthorized = m.top.status = "online" or m.top.status = "reconnecting"
        m.ws = invalid
        if wasAuthorized then
            m.top.status = "offline"
            m.scheduleReconnect()
        end if
    end if
end sub

sub handleRegisterEvent(msg as Object)
    ' Respuestas tardías del POST de registro (normalmente ya consumidas).
end sub

sub handleRetryEvent()
    m.retryTimer = invalid
    if m.running then m.connect()
end sub

sub sendMeta()
    if m.ws <> invalid
        meta = {
            type: "meta"
            software: "checador-roku " + m.appVersion
            os_version: m.osVersion
        }
        m.ws.Send(FormatJson(meta))
    end if
end sub

sub scheduleReconnect()
    if not m.running then return
    if m.retryTimer <> invalid then return
    m.backoffS = CapReconnectBackoff(m.backoffS)
    m.top.status = "reconnecting"
    t = CreateObject("roTimer")
    t.SetPort(m.port)
    t.SetDuration(m.backoffS, true)
    if t.Start() then
        m.retryTimer = t
    end if
end sub