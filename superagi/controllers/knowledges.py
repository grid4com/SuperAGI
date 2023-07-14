from fastapi_sqlalchemy import db
from fastapi import HTTPException, Depends, Query, status
from fastapi import APIRouter
from superagi.config.config import get_config
from superagi.helper.auth import get_user_organisation
from superagi.models.knowledges import Knowledges
from superagi.models.marketplace_stats import MarketPlaceStats
from superagi.models.knowledge_configs import KnowledgeConfigs
from superagi.models.vector_db_indices import VectordbIndices
from superagi.models.vector_dbs import Vectordbs
from superagi.helper.s3_helper import S3Helper
from superagi.models.vector_db_configs import VectordbConfigs
from superagi.vector_store.vector_factory import VectorFactory
from superagi.vector_embeddings.vector_embedding_factory import VectorEmbeddingFactory

router = APIRouter()

@router.get("/get/list")
def get_knowledge_list(
    page: int = Query(None, title="Page Number"),
    organisation = Depends(get_user_organisation)
):
    """
    Get Marketplace Knowledge list.

    Args:
        page (int, optional): The page number for pagination. Defaults to None.

    Returns:
        dict: The response containing the marketplace list.

    """

    marketplace_knowledges = Knowledges.fetch_marketplace_list(page)
    marketplace_knowledges_with_install = Knowledges.get_knowledge_install_details(db.session, marketplace_knowledges, organisation)
    for knowledge in marketplace_knowledges_with_install:
        knowledge["install_number"] = MarketPlaceStats.get_knowledge_installation_number(knowledge["id"])
    return marketplace_knowledges_with_install    

@router.get("/marketplace/list/{page}")
def get_marketplace_knowledge_list(page: int = 0):
    organisation_id = int(get_config("MARKETPLACE_ORGANISATION_ID"))
    page_size = 30

    # Apply search filter if provided
    query = db.session.query(Knowledges).filter(Knowledges.organisation_id == organisation_id)

    if page < 0:
        knowledges = query.all()
    # Paginate the results
    knowledges = query.offset(page * page_size).limit(page_size).all()

    return knowledges

@router.get("/user/list")
def get_user_knowledge_list(organisation = Depends(get_user_organisation)):
    marketplace_knowledges = Knowledges.fetch_marketplace_list(page=-1)
    user_knowledge_list = Knowledges.get_organisation_knowledges(db.session, organisation)
    for user_knowledge in user_knowledge_list:
        if user_knowledge["name"] in [knowledge.name for knowledge in marketplace_knowledges]:
            user_knowledge["is_marketplace"] = True
        else:
            user_knowledge["is_marketplace"] = False
    return user_knowledge_list

@router.get("/marketplace/get/details/{knowledge_name}")
def get_knowledge_details(knowledge_name: str):
    knowledge_data = Knowledges.fetch_knowledge_details_marketplace(knowledge_name)
    knowledge_config_data = KnowledgeConfigs.fetch_knowledge_config_details_marketplace(knowledge_data["id"])
    knowledge_data_with_config = knowledge_data | knowledge_config_data
    return knowledge_data_with_config

@router.get("/marketplace/details/{knowledge_name}")
def get_marketplace_knowledge_details(knowledge_name: str):
    organisation_id: int(get_config("MARKETPLACE_ORGANISATION_ID"))
    knowledge_details = db.session.query(Knowledges).filter(Knowledges.name == knowledge_name, Knowledges.organisation_id == organisation_id).first()
    return knowledge_details

@router.get("/user/get/details/{knowledge_id}")
def get_user_knowledge_details(knowledge_id: int):
    knowledge_data = Knowledges.get_knowledge_from_id(db.session, knowledge_id)
    vector_database_index = VectordbIndices.get_vector_index_from_id(db.session, knowledge_data.vector_db_index_id)
    vector_database = Vectordbs.get_vector_db_from_id(db.session, vector_database_index.vector_db_id)
    knowledge = {
        "name": knowledge_data.name,
        "description": knowledge_data.description,
        "vector_database_index": {
            "id": vector_database_index.id,
            "name": vector_database_index.name
        },
        "vector_database": vector_database.name,
        "installation_type": vector_database_index.state
    }
    return knowledge

@router.post("/add_or_update/data")
def add_update_user_knowledge(knowledge_data: dict, organisation = Depends(get_user_organisation)):
    knowledge_data["organisation_id"] = organisation.id
    knowledge_data["contributed_by"] = organisation.name
    knowledge = Knowledges.add_update_knowledges(db.session, knowledge_data)
    return {"success": True, "id": knowledge.id}

@router.post("/user/delete/{knowledge_id}")
def delete_user_knowledge(knowledge_id: int):
    try:
        db.session.query(Knowledges).filter(Knowledges.id == knowledge_id).delete()
        db.session.commit()
        return {"success": True}
    except:
        return f"No Knowledge found for {knowledge_id}."

@router.post("/install/knowledge/{knowledge_id}/index/{vector_db_index_id}")
def install_selected_knowledge(knowledge_id: int, vector_db_index_id: int, organisation = Depends(get_user_organisation)):
    vector_db_index = VectordbIndices.get_vector_index_from_id(db.session, vector_db_index_id)
    filepath = db.session.query(KnowledgeConfigs).filter(KnowledgeConfigs.knowledge_id == knowledge_id, KnowledgeConfigs.key == "file_path").first().value
    file_chunks = S3Helper().get_json_file(filepath)
    vector = Vectordbs.get_vector_db_from_id(db.session, vector_db_index.vector_db_id)
    db_creds = VectordbConfigs.get_vector_db_config_from_db_id(db.session, vector.id)
    upsert_data = VectorEmbeddingFactory.convert_final_chunks_to_embeddings(vector.db_type, file_chunks)
    try:
        VectorFactory.add_embeddings_to_vector_db(upsert_data, db_creds) 