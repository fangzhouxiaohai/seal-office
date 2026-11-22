package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 密码尝试计数：按 15 分钟窗口限流，key 为 HMAC 混淆后的限流键。
 * 真实主键是 (key, window) 组合，这里仅为 MyBatis-Plus 映射占位。
 */
@Data
@TableName("password_attempts")
public class PasswordAttemptEntity {

    @TableId(type = IdType.INPUT)
    private String key;

    private Long window;

    private Integer count;
}
