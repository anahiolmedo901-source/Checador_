function THEME_BG() as String : return "0x0B1120" : end function
function THEME_PANEL() as String : return "0x16213A" : end function
function THEME_ACCENT() as String : return "0x2DD4BF" : end function
function THEME_TEXT() as String : return "0xE2E8F0" : end function
function THEME_MUTED() as String : return "0x64748B" : end function
function THEME_GREEN() as String : return "0x22C55E" : end function
function THEME_AMBER() as String : return "0xF59E0B" : end function
function THEME_RED() as String : return "0xEF4444" : end function
function THEME_COLUMN_PANEL() as String : return "0x0F2447" : end function

sub init()
    m.snap = invalid
    m.slot = 0
    m.checkRunning = false

    m.buildFrame()
    m.buildContent()

    m.top.observeField("start", "onStart")

    m.rotTimer = m.newTimer(8, "onRotate")
    m.clockTimer = m.newTimer(1, "onClock")
    m.checkTimer = m.newTimer(8, "onCheckDone")
    m.clockTimer.control = "start"
end sub

sub onStart()
    if m.top.start <> true then return
    m.bootClient()
end sub

sub bootClient()
    if m.client <> invalid then return
    m.client = CreateObject("roSGNode", "DisplayClient")
    m.client.backend = m.top.backend
    m.client.code = m.top.code
    m.client.token = m.top.token
    m.client.observeField("payload", "onPayload")
    m.client.observeField("status", "onStatus")
    m.top.appendChild(m.client)
    m.client.control = "RUN"
end sub

sub newTimer(duration as Integer, callback as String) as Object
    t = CreateObject("roSGNode", "Timer")
    t.duration = duration
    t.repeat = true
    t.observeField("fire", callback)
    m.top.appendChild(t)
    return t
end sub

sub node(className as String) as Object
    n = CreateObject("roSGNode", className)
    return n
end sub

sub buildFrame()
    bg = m.node("Poster")
    bg.color = THEME_BG
    bg.width = 1920
    bg.height = 1080
    m.top.appendChild(bg)

    m.branchLabel = m.node("Label")
    m.branchLabel.font.size = 54
    m.branchLabel.color = THEME_TEXT
    m.branchLabel.translation = [ 60, 40 ]
    m.branchLabel.text = "Checador"
    m.top.appendChild(m.branchLabel)

    m.dateLabel = m.node("Label")
    m.dateLabel.font.size = 26
    m.dateLabel.color = THEME_MUTED
    m.dateLabel.translation = [ 62, 104 ]
    m.top.appendChild(m.dateLabel)
    m.dateLabel.text = NowDateShort()

    m.clockLabel = m.node("Label")
    m.clockLabel.font.size = 54
    m.clockLabel.color = THEME_TEXT
    m.clockLabel.horizAlign = "right"
    m.clockLabel.translation = [ 1780, 40 ]
    m.top.appendChild(m.clockLabel)

    m.badge = m.node("Label")
    m.badge.font.size = 28
    m.badge.horizAlign = "right"
    m.badge.translation = [ 1660, 104 ]
    m.badge.text = "Conectando…"
    m.badge.color = THEME_AMBER
    m.top.appendChild(m.badge)
end sub

sub buildContent()
    m.content = m.node("Group")
    m.top.appendChild(m.content)

    m.buildStats()
    m.buildAnnounce()
    m.buildMedia()
    m.buildOverlay()
    m.buildStatusPanel()
end sub

sub buildStats()
    m.statsGroup = m.node("Group")
    m.content.appendChild(m.statsGroup)

    title = m.node("Label")
    title.text = "Resumen del día"
    title.font.size = 34
    title.color = THEME_ACCENT
    title.translation = [ 60, 180 ]
    m.statsGroup.appendChild(title)

    m.counters = []
    m.counterNodes = []
    counterLabels = [
        { key: "total", label: "Total" }
        { key: "present", label: "Presentes" }
        { key: "late", label: "Retardos" }
        { key: "excused", label: "Incidencia" }
        { key: "missing", label: "Faltas" }
    ]
    y = 240
    for i = 0 to counterLabels.Count() - 1
        w = 330
        x = 60 + i * (w + 24)
        card = m.node("Poster")
        card.width = w
        card.height = 130
        card.color = THEME_COLUMN_PANEL
        card.translation = [ x, y ]
        m.statsGroup.appendChild(card)

        value = m.node("Label")
        value.font.size = 52
        value.color = THEME_TEXT
        value.horizAlign = "center"
        value.translation = [ x + w / 2, y + 16 ]
        value.width = w
        value.text = "0"
        m.statsGroup.appendChild(value)

        name = m.node("Label")
        name.font.size = 24
        name.color = THEME_MUTED
        name.horizAlign = "center"
        name.translation = [ x + w / 2, y + 88 ]
        name.width = w
        name.text = counterLabels[i].label
        m.statsGroup.appendChild(name)

        m.counterNodes.Push({ key: counterLabels[i].key, valueNode: value })
    end for

    lastTitle = m.node("Label")
    lastTitle.text = "Últimos checados"
    lastTitle.font.size = 34
    lastTitle.color = THEME_ACCENT
    lastTitle.translation = [ 60, 430 ]
    m.statsGroup.appendChild(lastTitle)

    m.lastChecks = m.node("Label")
    m.lastChecks.font.size = 28
    m.lastChecks.color = THEME_TEXT
    m.lastChecks.translation = [ 60, 480 ]
    m.lastChecks.width = 1800
    m.lastChecks.wrap = false
    m.lastChecks.text = "Sin registros todavía"
    m.statsGroup.appendChild(m.lastChecks)
end sub

sub buildAnnounce()
    m.annGroup = m.node("Group")
    m.content.appendChild(m.annGroup)

    panel = m.node("Poster")
    panel.color = THEME_PANEL
    panel.width = 1760
    panel.height = 720
    panel.translation = [ 80, 200 ]
    m.annGroup.appendChild(panel)

    m.annTitle = m.node("Label")
    m.annTitle.font.size = 48
    m.annTitle.color = THEME_TEXT
    m.annTitle.wrap = true
    m.annTitle.width = 1600
    m.annTitle.horizAlign = "center"
    m.annTitle.translation = [ 160, 260 ]
    m.annGroup.appendChild(m.annTitle)

    m.annBody = m.node("Label")
    m.annBody.font.size = 40
    m.annBody.color = THEME_TEXT
    m.annBody.wrap = true
    m.annBody.width = 1560
    m.annBody.horizAlign = "center"
    m.annBody.vertAlign = "center"
    m.annBody.maxLines = 8
    m.annBody.translation = [ 180, 380 ]
    m.annGroup.appendChild(m.annBody)
end sub

sub buildMedia()
    m.mediaGroup = m.node("Group")
    m.content.appendChild(m.mediaGroup)

    m.mediaPoster = m.node("Poster")
    m.mediaPoster.width = 1760
    m.mediaPoster.height = 720
    m.mediaPoster.translation = [ 80, 200 ]
    m.mediaPoster.loadSync = true
    m.mediaGroup.appendChild(m.mediaPoster)

    m.videoContent = m.node("ContentNode")
    m.video = m.node("Video")
    m.video.width = 1760
    m.video.height = 720
    m.video.translation = [ 80, 200 ]
    m.video.enableUI = false
    m.video.visible = false
    m.video.content = m.videoContent
    m.mediaGroup.appendChild(m.video)
end sub

sub buildOverlay()
    m.overlay = m.node("Group")
    m.overlay.visible = false
    m.top.appendChild(m.overlay)

    dimBg = m.node("Poster")
    dimBg.color = "0x000000"
    dimBg.width = 1920
    dimBg.height = 1080
    dimBg.opacity = 0.72
    m.overlay.appendChild(dimBg)

    panel = m.node("Poster")
    panel.color = THEME_PANEL
    panel.width = 900
    panel.height = 420
    panel.translation = [ 510, 300 ]
    m.overlay.appendChild(panel)

    m.overlayName = m.node("Label")
    m.overlayName.font.size = 72
    m.overlayName.color = THEME_TEXT
    m.overlayName.horizAlign = "center"
    m.overlayName.width = 760
    m.overlayName.translation = [ 580, 340 ]
    m.overlay.appendChild(m.overlayName)

    m.overlayType = m.node("Label")
    m.overlayType.font.size = 64
    m.overlayType.horizAlign = "center"
    m.overlayType.width = 760
    m.overlayType.translation = [ 580, 470 ]
    m.overlay.appendChild(m.overlayType)

    m.overlayTime = m.node("Label")
    m.overlayTime.font.size = 56
    m.overlayTime.color = THEME_TEXT
    m.overlayTime.horizAlign = "center"
    m.overlayTime.width = 760
    m.overlayTime.translation = [ 580, 560 ]
    m.overlay.appendChild(m.overlayTime)
end sub

sub buildStatusPanel()
    m.statusGroup = m.node("Group")
    m.statusGroup.visible = false
    m.top.appendChild(m.statusGroup)

    bg = m.node("Poster")
    bg.color = THEME_BG
    bg.width = 1920
    bg.height = 1080
    m.statusGroup.appendChild(bg)

    m.statusText = m.node("Label")
    m.statusText.font.size = 48
    m.statusText.color = THEME_TEXT
    m.statusText.horizAlign = "center"
    m.statusText.width = 1600
    m.statusText.wrap = true
    m.statusText.translation = [ 160, 380 ]
    m.statusGroup.appendChild(m.statusText)

    m.reconfigButton = m.node("Button")
    m.reconfigButton.text = "Configurar pantalla"
    m.reconfigButton.translation = [ 840, 540 ]
    m.reconfigButton.visible = false
    m.reconfigButton.observeField("buttonSelected", "onOpenSetupPressed")
    m.statusGroup.appendChild(m.reconfigButton)
end sub

' ─────────────────────────── Entradas del cliente ───────────────────────────

sub onPayload()
    data = ParseJson(m.top.payload)
    if data = invalid then return
    payloadType = data.type
    if payloadType = "snapshot" and data.snapshot <> invalid
        m.applySnapshot(data.snapshot)
    else if payloadType = "check" and data.check <> invalid
        m.showCheck(data.check)
    else if payloadType = "revoked"
        m.authFailed("El token de esta pantalla fue revocado por el administrador.")
    else if payloadType = "unauthorized"
        m.authFailed("Código o token no autorizado. Verifica la configuración.")
    else if payloadType = "replaced"
        m.authFailed("Esta pantalla se conectó desde otro dispositivo.")
    end if
end sub

sub onStatus()
    status = m.top.status
    if status = "online"
        m.badge.text = "En línea"
        m.badge.color = THEME_GREEN
        m.statusGroup.visible = false
    else if status = "reconnecting"
        m.badge.text = "Reconectando…"
        m.badge.color = THEME_AMBER
        m.statusGroup.visible = false
    else if status = "connecting" or status = "registering"
        m.badge.text = "Conectando…"
        m.badge.color = THEME_AMBER
        m.statusGroup.visible = true
        m.statusText.text = "Conectando con el servidor…"
    else if status = "offline"
        m.badge.text = "Sin conexión"
        m.badge.color = THEME_RED
        m.statusGroup.visible = true
        m.statusText.text = "Sin conexión con el servidor. Reintentando…"
    end if
end sub

sub authFailed(message as String)
    m.badge.text = "No autorizado"
    m.badge.color = THEME_RED
    m.statusGroup.visible = true
    m.statusText.text = message
    m.reconfigButton.visible = true
end sub

sub onOpenSetupPressed()
    m.top.openSetup = true
end sub

' ─────────────────────────── Snapshot ───────────────────────────

sub applySnapshot(snapshot as Object)
    m.snap = snapshot
    if snapshot.branch <> invalid and snapshot.branch.name <> invalid then
        m.branchLabel.text = snapshot.branch.name
    end if
    m.applyCounts(snapshot.counts)
    m.applyLastChecks(snapshot.last_checks)

    playlist = []
    if snapshot.playlist <> invalid
        for each item in snapshot.playlist
            playlist.Push(item)
        end for
    end if
    if playlist.Count() = 0
        playlist = [{ item_type: "stats", duration_s: 8 }]
    end if
    m.playlist = playlist
    m.slot = 0
    m.showSlot(0)
end sub

sub applyCounts(counts as Object)
    if counts = invalid then return
    for each entry in m.counterNodes
        v = counts[entry.key]
        if v = invalid then v = 0
        entry.valueNode.text = v.ToStr()
    end for
end sub

sub applyLastChecks(checks as Object)
    if checks = invalid or checks.Count() = 0 then
        m.lastChecks.text = "Sin registros todavía"
        return
    end if
    lines = []
    limit = 8
    if checks.Count() < limit then limit = checks.Count()
    for i = 0 to limit - 1
        c = checks[i]
        name = SafeStr(c.name)
        if Len(name) > 24 then name = Left(name, 22) + "…"
        label = CheckTypeLabel(SafeStr(c.check_type))
        time = SafeStr(c.time)
        status = SafeStr(c.status)
        lines.Push("    " + time + "   " + PadRightStr(name, 26) + PadRightStr(label, 18) + status)
    end for
    m.lastChecks.text = Join(lines, Chr(10))
end sub

' ─────────────────────────── Rotación playlist ───────────────────────────

sub showSlot(index as Integer)
    if m.playlist = invalid or m.playlist.Count() = 0 then
        m.rotTimer.control = "stop"
        return
    end if
    index = index Mod m.playlist.Count()
    m.slot = index
    item = m.playlist[index]
    itemType = SafeStr(item.item_type)

    m.statsGroup.visible = (itemType = "stats")
    m.annGroup.visible = (itemType = "announcement")
    m.mediaGroup.visible = (itemType = "media")

    if itemType = "stats"
        m.rotTimer.duration = 8
    else if itemType = "announcement"
        m.showAnnouncement(item)
        m.rotTimer.duration = SafeInt(item.duration_s, 8)
    else if itemType = "media"
        m.showMedia(item)
        m.rotTimer.duration = SafeInt(item.duration_s, 12)
    end if
    m.rotTimer.repeat = true
    m.rotTimer.control = "start"
end sub

sub onRotate()
    if m.overlay.visible then return
    m.showSlot(m.slot + 1)
end sub

sub showAnnouncement(item as Object)
    m.annTitle.text = "Aviso"
    m.annBody.text = ""
    if item.announcement <> invalid
        if item.announcement.title <> invalid and item.announcement.title <> ""
            m.annTitle.text = item.announcement.title
        end if
        if item.announcement.body <> invalid then
            m.annBody.text = item.announcement.body
        end if
    end if
end sub

sub showMedia(item as Object)
    media = item.media
    m.video.control = "stop"
    m.video.visible = false
    m.mediaPoster.visible = true
    m.mediaPoster.uri = ""
    if media = invalid then return
    url = SafeStr(media.signed_url)
    if url = "" then
        m.mediaPoster.visible = false
        return
    end if
    kind = SafeStr(media.kind)
    if kind = "video" or IsVideoUrl(url)
        m.mediaPoster.visible = false
        m.videoContent.url = url
        m.videoContent.streamformat = StreamFormatFor(url)
        m.video.visible = true
        m.video.control = "play"
    else
        m.mediaPoster.uri = url
    end if
end sub

' ─────────────────────────── Evento check (overlay) ───────────────────────────

sub showCheck(check as Object)
    name = SafeStr(check.name)
    if name = "" then name = "Empleado"
    m.overlayName.text = name
    checkType = SafeStr(check.check_type)
    m.overlayType.text = CheckTypeLabel(checkType)
    m.overlayType.color = CheckTypeColor(checkType)
    m.overlayTime.text = SafeStr(check.time)

    m.checkTimer.duration = m.checkOverlaySeconds()
    m.checkTimer.control = "stop"
    m.checkTimer.control = "start"
    m.checkTimer.repeat = false
    m.overlay.visible = true
end sub

sub onCheckDone()
    m.overlay.visible = false
end sub

function checkOverlaySeconds() as Integer
    if m.snap <> invalid and m.snap.config <> invalid then
        return SafeInt(m.snap.config.check_overlay_s, 8)
    end if
    return 8
end function

sub onClock()
    m.clockLabel.text = NowClock()
end sub