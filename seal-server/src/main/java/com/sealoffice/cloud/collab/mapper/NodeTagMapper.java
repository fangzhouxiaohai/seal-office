package com.sealoffice.cloud.collab.mapper;

import com.sealoffice.cloud.store.entity.NodeEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * node_tags 表访问：语句与 Node collaboration.cjs 逐条对应。
 */
public interface NodeTagMapper {

    @Delete("DELETE FROM node_tags WHERE tag_id = #{tagId} AND user_id = #{userId}")
    int deleteForTag(@Param("tagId") String tagId, @Param("userId") String userId);

    @Delete("DELETE FROM node_tags WHERE node_id = #{nodeId} AND user_id = #{userId}")
    int deleteForNode(@Param("nodeId") String nodeId, @Param("userId") String userId);

    @Insert("INSERT INTO node_tags(user_id,node_id,tag_id) VALUES(#{userId},#{nodeId},#{tagId})")
    int insert(@Param("userId") String userId, @Param("nodeId") String nodeId, @Param("tagId") String tagId);

    @Select("SELECT n.* FROM nodes n JOIN node_tags nt ON nt.node_id = n.id"
            + " WHERE n.user_id = #{userId} AND nt.tag_id = #{tagId} AND n.deleted = 0")
    List<NodeEntity> nodesForTag(@Param("userId") String userId, @Param("tagId") String tagId);
}
