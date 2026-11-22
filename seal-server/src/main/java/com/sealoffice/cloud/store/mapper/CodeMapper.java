package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.entity.CodeEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * codes 表访问：复合主键 (phone, purpose)，一次性消费。
 */
public interface CodeMapper extends BaseMapper<CodeEntity> {

    @Select("SELECT phone, purpose, hash, expires, attempts FROM codes WHERE phone = #{phone} AND purpose = #{purpose}")
    CodeEntity find(@Param("phone") String phone, @Param("purpose") String purpose);

    @Insert("INSERT INTO codes(phone, purpose, hash, expires, attempts) VALUES(#{phone}, #{purpose}, #{hash}, #{expires}, 0)")
    int insertNew(@Param("phone") String phone, @Param("purpose") String purpose,
                  @Param("hash") String hash, @Param("expires") long expires);

    @Update("UPDATE codes SET attempts = attempts + 1 WHERE phone = #{phone} AND purpose = #{purpose}")
    int incrementAttempts(@Param("phone") String phone, @Param("purpose") String purpose);

    @Delete("DELETE FROM codes WHERE phone = #{phone} AND purpose = #{purpose}")
    int delete(@Param("phone") String phone, @Param("purpose") String purpose);
}
