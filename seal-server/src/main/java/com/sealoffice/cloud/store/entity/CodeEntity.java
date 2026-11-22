package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 短信验证码：仅存 HMAC 摘要，5 分钟有效、5 次尝试上限，一次消费。
 * 真实主键是 (phone, purpose) 组合，这里仅为 MyBatis-Plus 映射占位。
 */
@Data
@TableName("codes")
public class CodeEntity {

    @TableId(type = IdType.INPUT)
    private String phone;

    private String purpose;

    private String hash;

    private Long expires;

    private Integer attempts;
}
