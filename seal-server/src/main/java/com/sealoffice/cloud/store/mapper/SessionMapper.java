package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.dto.SessionInfo;
import com.sealoffice.cloud.store.entity.SessionEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * sessions 表访问；令牌只存 sha256，查询均带未过期条件。
 */
public interface SessionMapper extends BaseMapper<SessionEntity> {

    @Select("SELECT s.hash AS hash, s.user_id AS userId, s.expires AS expires, "
            + "d.device_id AS deviceId, d.device_name AS deviceName, d.last_seen AS lastSeen "
            + "FROM sessions s LEFT JOIN session_devices d ON d.session_hash = s.hash "
            + "WHERE s.hash = #{hash} AND s.expires > #{now}")
    SessionInfo findValidWithDevice(@Param("hash") String hash, @Param("now") long now);

    @Select("SELECT hash FROM sessions WHERE hash = #{hash} AND expires > #{now}")
    String findValidHash(@Param("hash") String hash, @Param("now") long now);

    @Delete("DELETE FROM sessions WHERE user_id = #{userId} AND hash <> #{hash}")
    int deleteOtherSessions(@Param("userId") String userId, @Param("hash") String hash);

    @Delete("DELETE FROM sessions WHERE user_id = #{userId} AND hash IN "
            + "(SELECT session_hash FROM session_devices WHERE user_id = #{userId} AND device_id = #{deviceId})")
    int deleteByDevice(@Param("userId") String userId, @Param("deviceId") String deviceId);

    /** 密码修改后按 Node 行为同步清理孤儿在线状态行 */
    @Delete("DELETE FROM realtime_presence WHERE session_hash NOT IN (SELECT hash FROM sessions)")
    int deleteOrphanPresence();
}
