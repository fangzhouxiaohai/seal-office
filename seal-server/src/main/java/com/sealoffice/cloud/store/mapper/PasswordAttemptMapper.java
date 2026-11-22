package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.entity.PasswordAttemptEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * password_attempts 表访问：15 分钟窗口限流计数。
 * `key`、`window` 为 MySQL 保留字，统一反引号。
 */
public interface PasswordAttemptMapper extends BaseMapper<PasswordAttemptEntity> {

    @Delete("DELETE FROM password_attempts WHERE `window` < #{window}")
    int deleteOlderThan(@Param("window") long window);

    @Select("SELECT count FROM password_attempts WHERE `key` = #{key} AND `window` = #{window}")
    Integer selectCount(@Param("key") String key, @Param("window") long window);

    @Update("UPDATE password_attempts SET count = count + 1 WHERE `key` = #{key} AND `window` = #{window}")
    int increment(@Param("key") String key, @Param("window") long window);

    @Insert("INSERT INTO password_attempts(`key`, `window`, count) VALUES(#{key}, #{window}, 1)")
    int insertNew(@Param("key") String key, @Param("window") long window);
}
