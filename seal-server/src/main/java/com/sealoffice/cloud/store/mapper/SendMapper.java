package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.entity.SendEntity;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * sends 表访问：发送限流计数。
 */
public interface SendMapper extends BaseMapper<SendEntity> {

    @Select("SELECT COUNT(*) FROM sends WHERE phone = #{phone} AND time > #{since}")
    long countByPhoneSince(@Param("phone") String phone, @Param("since") long since);

    @Select("SELECT COUNT(*) FROM sends WHERE ip = #{ip} AND time > #{since}")
    long countByIpSince(@Param("ip") String ip, @Param("since") long since);
}
