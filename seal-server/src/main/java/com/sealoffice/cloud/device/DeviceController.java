package com.sealoffice.cloud.device;

import com.sealoffice.cloud.common.ApiException;
import com.sealoffice.cloud.security.ClockHolder;
import com.sealoffice.cloud.security.SessionContext;
import com.sealoffice.cloud.security.SessionService;
import com.sealoffice.cloud.store.AuditRecorder;
import com.sealoffice.cloud.store.dto.DeviceRow;
import com.sealoffice.cloud.store.mapper.SessionDeviceMapper;
import com.sealoffice.cloud.store.mapper.SessionMapper;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 设备管理：与 Node collaboration.cjs 的 /v1/devices 段逐字一致。
 * 设备按 deviceId 聚合多个会话；撤销设备即删除其全部会话（立即 401）。
 */
@RestController
public class DeviceController {

    private static final Pattern DEVICE_UUID = Pattern.compile("[0-9a-f-]{36}");

    private final SessionDeviceMapper deviceMapper;
    private final SessionMapper sessionMapper;
    private final AuditRecorder audit;
    private final ClockHolder clock;
    private final TransactionTemplate tx;

    public DeviceController(SessionDeviceMapper deviceMapper, SessionMapper sessionMapper, AuditRecorder audit,
                            ClockHolder clock, TransactionTemplate transactionTemplate) {
        this.deviceMapper = deviceMapper;
        this.sessionMapper = sessionMapper;
        this.audit = audit;
        this.clock = clock;
        this.tx = transactionTemplate;
    }

    /** 设备列表：按 deviceId 聚合，名称取最近活跃会话的登记名。 */
    @GetMapping("/v1/devices")
    public Map<String, Object> list() {
        SessionContext.ClientUser client = SessionContext.user();
        List<DeviceRow> rows = deviceMapper.findActiveRows(client.id(), clock.now());
        Map<String, Map<String, Object>> grouped = new LinkedHashMap<>();
        for (DeviceRow row : rows) {
            Map<String, Object> item = grouped.computeIfAbsent(row.getDeviceId(), id -> {
                Map<String, Object> view = new LinkedHashMap<>();
                view.put("id", id);
                view.put("name", row.getDeviceName());
                view.put("created", row.getCreated());
                view.put("lastSeen", row.getLastSeen());
                view.put("expires", row.getExpires());
                return view;
            });
            item.put("created", Math.min((Long) item.get("created"), row.getCreated()));
            if ((Long) item.get("lastSeen") <= row.getLastSeen()) {
                item.put("name", row.getDeviceName());
            }
            item.put("lastSeen", Math.max((Long) item.get("lastSeen"), row.getLastSeen()));
            item.put("expires", Math.max((Long) item.get("expires"), row.getExpires()));
        }
        List<Map<String, Object>> items = new ArrayList<>();
        grouped.forEach((id, view) -> {
            view.put("current", id.equals(client.deviceId()));
            items.add(view);
        });
        return Map.of("items", items);
    }

    /** 登记/改名当前设备：作用于当前会话对应行。 */
    @PostMapping("/v1/devices")
    public Map<String, Object> register(@RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        Object id = body.get("id");
        Object name = body.get("name");
        if (!(id instanceof String deviceId) || !DEVICE_UUID.matcher(deviceId).matches()
                || !(name instanceof String deviceName) || SessionService.trimJs(deviceName).isEmpty()
                || deviceName.length() > 80) {
            throw ApiException.of(400, "设备标识或名称无效");
        }
        SessionContext.ClientUser client = SessionContext.user();
        String trimmed = SessionService.trimJs(deviceName);
        tx.executeWithoutResult(status ->
                deviceMapper.rebindCurrent(client.sessionHash(), client.id(), deviceId, trimmed, clock.now()));
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", deviceId);
        reply.put("name", trimmed);
        reply.put("current", true);
        return reply;
    }

    /** 改名：该设备全部会话行同步更新。 */
    @PatchMapping("/v1/devices/{id}")
    public Map<String, Object> rename(@PathVariable String id, @RequestBody(required = false) Map<String, Object> input) {
        Map<String, Object> body = input == null ? Map.of() : input;
        SessionContext.ClientUser client = SessionContext.user();
        ensureDeviceExists(client, id);

        Object name = body.get("name");
        if (!(name instanceof String deviceName) || SessionService.trimJs(deviceName).isEmpty()
                || deviceName.length() > 80) {
            throw ApiException.of(400, "设备名称无效");
        }
        String trimmed = SessionService.trimJs(deviceName);
        tx.executeWithoutResult(status -> deviceMapper.rename(client.id(), id, trimmed));
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("id", id);
        reply.put("name", trimmed);
        return reply;
    }

    /** 撤销：删除该设备全部会话与登记行。 */
    @DeleteMapping("/v1/devices/{id}")
    public Map<String, Object> revoke(@PathVariable String id) {
        SessionContext.ClientUser client = SessionContext.user();
        ensureDeviceExists(client, id);
        tx.executeWithoutResult(status -> {
            sessionMapper.deleteByDevice(client.id(), id);
            deviceMapper.deleteDeviceRows(client.id(), id);
            audit.record(client.id(), "device-revoke", id);
        });
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("revoked", true);
        reply.put("current", id.equals(client.deviceId()));
        return reply;
    }

    /** Node 对不匹配 uuid 形态或未支持方法的 /v1/devices/{id} 一律 404「设备接口不存在」 */
    @org.springframework.web.bind.annotation.RequestMapping(value = "/v1/devices/{id}",
            method = {org.springframework.web.bind.annotation.RequestMethod.GET,
                    org.springframework.web.bind.annotation.RequestMethod.POST,
                    org.springframework.web.bind.annotation.RequestMethod.PUT})
    public void invalidDeviceRoute() {
        throw ApiException.of(404, "设备接口不存在");
    }

    private void ensureDeviceExists(SessionContext.ClientUser client, String deviceId) {
        if (!DEVICE_UUID.matcher(deviceId).matches()) {
            throw ApiException.of(404, "设备接口不存在");
        }
        if (deviceMapper.findActiveSessionByDevice(client.id(), deviceId, clock.now()) == null) {
            throw ApiException.of(404, "设备会话不存在");
        }
    }
}
