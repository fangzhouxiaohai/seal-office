package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 登录会话：hash = sha256(令牌)，30 天有效；删除即令牌立即失效。
 */
@Data
@TableName("sessions")
public class SessionEntity {

    @TableId(type = IdType.INPUT)
    private String hash;

    private String userId;

    private Long expires;
}
