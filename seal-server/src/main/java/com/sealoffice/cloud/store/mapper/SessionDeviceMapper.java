package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.dto.DeviceRow;
import com.sealoffice.cloud.store.entity.SessionDeviceEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * session_devices 表访问：设备改名、撤销（删会话）、活跃心跳。
 */
public interface SessionDeviceMapper extends BaseMapper<SessionDeviceEntity> {

    @Select("SELECT d.device_id AS deviceId, d.device_name AS deviceName, d.created AS created, "
            + "d.last_seen AS lastSeen, s.expires AS expires "
            + "FROM sessions s JOIN session_devices d ON d.session_hash = s.hash "
            + "WHERE s.user_id = #{userId} AND s.expires > #{now}")
    List<DeviceRow> findActiveRows(@Param("userId") String userId, @Param("now") long now);

    @Select("SELECT s.hash FROM sessions s JOIN session_devices d ON d.session_hash = s.hash "
            + "WHERE s.user_id = #{userId} AND d.device_id = #{deviceId} AND s.expires > #{now} LIMIT 1")
    String findActiveSessionByDevice(@Param("userId") String userId, @Param("deviceId") String deviceId, @Param("now") long now);

    @Update("UPDATE session_devices SET device_id = #{deviceId}, device_name = #{deviceName}, last_seen = #{now} "
            + "WHERE session_hash = #{sessionHash} AND user_id = #{userId}")
    int rebindCurrent(@Param("sessionHash") String sessionHash, @Param("userId") String userId,
                      @Param("deviceId") String deviceId, @Param("deviceName") String deviceName, @Param("now") long now);

    @Update("UPDATE session_devices SET device_name = #{name} WHERE user_id = #{userId} AND device_id = #{deviceId}")
    int rename(@Param("userId") String userId, @Param("deviceId") String deviceId, @Param("name") String name);

    @Update("UPDATE session_devices SET last_seen = #{now} WHERE session_hash = #{sessionHash}")
    int touch(@Param("sessionHash") String sessionHash, @Param("now") long now);

    @Delete("DELETE FROM session_devices WHERE user_id = #{userId} AND device_id = #{deviceId}")
    int deleteDeviceRows(@Param("userId") String userId, @Param("deviceId") String deviceId);

    @Delete("DELETE FROM session_devices WHERE user_id = #{userId} AND session_hash <> #{sessionHash}")
    int deleteOtherSessions(@Param("userId") String userId, @Param("sessionHash") String sessionHash);
}
